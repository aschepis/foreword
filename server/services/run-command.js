import { spawn } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Run a shell command with a prompt as input.
 *
 * The prompt is delivered THREE WAYS so any agent CLI can pick what it likes:
 *   1. piped on stdin (works for Claude `claude -p`, Codex, etc.)
 *   2. written to a temp file; path exposed as $LOCAL_REVIEW_PROMPT_FILE
 *      (useful when the agent supports a file-reference syntax like
 *      Gemini's `@file`, or when stdin is unavailable)
 *   3. also as $LOCAL_REVIEW_PROMPT_FILE_DIR if the agent needs a workdir
 *
 * The temp file is cleaned up after the command exits, regardless of outcome.
 */
export function runCommand(command, input, cwd, timeoutMs) {
  return new Promise((resolve) => {
    let tempDir = null;
    let promptFile = null;
    try {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-prompt-'));
      promptFile = path.join(tempDir, 'prompt.txt');
      fs.writeFileSync(promptFile, input || '');
    } catch (e) {
      /* If temp-write fails, continue without the file — stdin still works. */
    }

    const env = {
      ...process.env,
      ...(promptFile ? { LOCAL_REVIEW_PROMPT_FILE: promptFile, LOCAL_REVIEW_PROMPT_FILE_DIR: tempDir } : {}),
    };

    const child = spawn('sh', ['-c', command], { cwd, env });
    let stdout = '', stderr = '';
    let timedOut = false;

    const timer = timeoutMs ? setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGTERM'); } catch {}
    }, timeoutMs) : null;

    function cleanup() {
      if (timer) clearTimeout(timer);
      if (tempDir) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
      }
    }

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => { cleanup(); resolve({ code, stdout, stderr, timedOut }); });
    child.on('error', (e) => { cleanup(); resolve({ code: -1, stdout, stderr: stderr + '\n' + e.message, timedOut }); });

    if (input) {
      try {
        child.stdin.write(input);
        child.stdin.end();
      } catch {
        /* stdin may be closed if the agent doesn't read it; ignore. */
      }
    } else {
      try { child.stdin.end(); } catch {}
    }
  });
}
