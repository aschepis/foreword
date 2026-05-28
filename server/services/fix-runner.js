import { spawn } from 'node:child_process';
import { db } from '../db.js';
import { gitAt, resolveSha } from '../git.js';
import { log } from '../log.js';

function fillTemplate(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? String(vars[k]) : ''));
}

function runCommand(command, input, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', command], { cwd, env: process.env });
    let stdout = '', stderr = '';
    let timedOut = false;
    const timer = timeoutMs ? setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGTERM'); } catch {}
    }, timeoutMs) : null;
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
    child.on('error', (e) => {
      if (timer) clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + '\n' + e.message, timedOut });
    });
    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

function buildThreadContext(comment) {
  /* Walk up via parent_id; gather siblings (replies that share parent_id with this comment),
     and the chain of ancestors. Returns a markdown rendering of the conversation. */
  const root = (() => {
    let cur = comment;
    while (cur.parent_id) {
      const p = db.prepare('SELECT * FROM comments WHERE id = ?').get(cur.parent_id);
      if (!p) break;
      cur = p;
    }
    return cur;
  })();

  const all = db
    .prepare(`SELECT * FROM comments WHERE review_id = ? AND (id = ? OR parent_id = ?) ORDER BY id ASC`)
    .all(comment.review_id, root.id, root.id);

  const lines = [];
  for (const c of all) {
    const who = c.source && c.source.startsWith('agent:') ? `${c.source.replace('agent:', '')} (agent)`
              : c.author;
    const star = c.id === comment.id ? '  ← this is the fix request' : '';
    lines.push(`**${who}** (${c.created_at})${star}:\n${c.body}\n`);
  }
  return lines.join('\n---\n\n');
}

async function isWorktreeClean(repoPath) {
  const git = gitAt(repoPath);
  const status = await git.status();
  return status.isClean();
}

export function listPendingFixes(reviewId) {
  return db.prepare(
    `SELECT * FROM comments
     WHERE review_id = ? AND agent_fixable = 1 AND (fix_status IS NULL OR fix_status = 'failed' OR fix_status = 'skipped')
     ORDER BY id ASC`
  ).all(reviewId);
}

/**
 * Run the fix agent against every fixable+unfixed comment, sequentially.
 * Each fix gets its own commit. emit() pushes progress events to the caller.
 */
export async function runFixes({ reviewId, agentConfigId, emit, timeoutMs = 15 * 60 * 1000 }) {
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(reviewId);
  const agent = db.prepare('SELECT * FROM agent_configs WHERE id = ?').get(agentConfigId);
  if (!review) throw new Error(`review #${reviewId} not found`);
  if (!agent) throw new Error(`agent #${agentConfigId} not found`);
  if (agent.kind !== 'fix') throw new Error(`agent "${agent.name}" is kind="${agent.kind}", expected "fix"`);

  const dirty = !(await isWorktreeClean(review.worktree_path));
  if (dirty) {
    throw new Error('worktree is dirty — commit or stash your changes before running the fix agent');
  }

  const pending = listPendingFixes(reviewId);
  emit?.({ type: 'start', total: pending.length, review_id: reviewId, agent_name: agent.name });
  log.agent(`▶ fix session review=${reviewId} agent="${agent.name}" pending=${pending.length}`);

  const results = [];
  let commitsMade = 0;

  for (let i = 0; i < pending.length; i++) {
    const comment = pending[i];
    const beforeSha = await resolveSha(review.worktree_path, 'HEAD');
    const startedAt = Date.now();

    /* Insert a fix run row so we can correlate later. */
    const runIns = db.prepare(
      `INSERT INTO agent_runs (review_id, agent_config_id, agent_name, kind, status, command, target_comment_id)
       VALUES (?, ?, ?, 'fix', 'running', ?, ?)`
    ).run(reviewId, agentConfigId, agent.name, agent.command, comment.id);
    const runId = runIns.lastInsertRowid;

    const threadContext = buildThreadContext(comment);
    const prompt = fillTemplate(agent.prompt_template, {
      worktree: review.worktree_path,
      file: comment.path || '(no file)',
      line: comment.line ?? '',
      base: review.base_ref,
      head: review.head_ref,
      comment: comment.body,
      thread_context: threadContext,
      before_sha: beforeSha,
    });

    db.prepare(`UPDATE agent_runs SET prompt = ? WHERE id = ?`).run(prompt, runId);

    emit?.({
      type: 'comment-start',
      index: i, total: pending.length,
      comment_id: comment.id,
      file: comment.path, line: comment.line,
      run_id: runId,
    });

    const { code, stdout, stderr, timedOut } = await runCommand(
      agent.command, prompt, review.worktree_path, timeoutMs
    );
    const durationMs = Date.now() - startedAt;
    const afterSha = await resolveSha(review.worktree_path, 'HEAD');
    const clean = await isWorktreeClean(review.worktree_path);
    const committed = afterSha !== beforeSha;

    let status, fixStatus;
    if (timedOut) { status = 'failed'; fixStatus = 'failed'; }
    else if (code !== 0) { status = 'failed'; fixStatus = 'failed'; }
    else if (!clean) { status = 'failed'; fixStatus = 'failed'; }
    else if (!committed) { status = 'success'; fixStatus = 'skipped'; }
    else { status = 'success'; fixStatus = 'fixed'; }

    db.prepare(
      `UPDATE agent_runs SET status = ?, finished_at = datetime('now'),
       stdout = ?, stderr = ?, exit_code = ?, duration_ms = ? WHERE id = ?`
    ).run(status, stdout, stderr, code, durationMs, runId);

    db.prepare(
      `UPDATE comments SET fix_status = ?, fix_commit_sha = ?, fix_run_id = ?, fixed_at = ? WHERE id = ?`
    ).run(
      fixStatus,
      fixStatus === 'fixed' ? afterSha : null,
      runId,
      fixStatus === 'fixed' ? new Date().toISOString() : null,
      comment.id
    );

    if (fixStatus === 'fixed') commitsMade++;

    const result = {
      comment_id: comment.id,
      run_id: runId,
      status: fixStatus,
      commit_sha: fixStatus === 'fixed' ? afterSha : null,
      exit_code: code,
      duration_ms: durationMs,
      message: timedOut ? `timed out after ${(timeoutMs / 1000).toFixed(0)}s`
             : code !== 0 ? `agent exited with code ${code}`
             : !clean ? 'agent left uncommitted changes'
             : !committed ? 'agent ran cleanly but made no commit (likely determined no change needed)'
             : 'fix committed',
    };
    results.push(result);

    const sigil = fixStatus === 'fixed' ? '✓' : fixStatus === 'skipped' ? '·' : '✗';
    const shaPart = fixStatus === 'fixed' ? ` sha=${afterSha.slice(0, 7)}` : '';
    log.agent(`${sigil} fix run #${runId} comment=${comment.id} status=${fixStatus}${shaPart} ${(durationMs / 1000).toFixed(2)}s`);

    emit?.({ type: 'comment-done', ...result, index: i, total: pending.length });
  }

  /* If commits were made, refresh review head_sha so subsequent diff loads see the fixes. */
  if (commitsMade > 0) {
    const newHead = await resolveSha(review.worktree_path, 'HEAD');
    db.prepare(`UPDATE reviews SET head_sha = ? WHERE id = ?`).run(newHead, reviewId);
    log.agent(`fix session updated review #${reviewId} head_sha to ${newHead.slice(0, 7)}`);
  }

  emit?.({ type: 'done', results, commits_made: commitsMade, total: pending.length });
  return { results, commits_made: commitsMade };
}
