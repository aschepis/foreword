import { db } from '../db.js';
import { getUnifiedDiff, getDiffFiles } from '../git.js';
import { log } from '../log.js';
import { runCommand } from './run-command.js';

function fillTemplate(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? String(vars[k]) : ''));
}

function formatGoals() {
  const goals = db
    .prepare('SELECT title, body FROM goals WHERE enabled = 1 ORDER BY sort_order ASC, id ASC')
    .all();
  if (!goals.length) return '';
  const lines = goals.map((g) => {
    const body = (g.body || '').trim();
    return body ? `- **${g.title}** — ${body}` : `- **${g.title}**`;
  });
  return `## Review goals\n\nThe reviewer should pay special attention to the following goals:\n${lines.join('\n')}\n`;
}

/**
 * Unwrap common agent CLI envelopes so the parser sees the actual assistant text.
 * Returns { text, envelope }. envelope is a hint string for diagnostics.
 */
function unwrapEnvelope(stdout) {
  const trimmed = (stdout || '').trim();
  if (!trimmed) return { text: '', envelope: null };

  // Claude Code: `claude -p --output-format json` → { type: "result", result: "..." }
  try {
    const obj = JSON.parse(trimmed);
    if (obj && typeof obj === 'object') {
      if (obj.type === 'result' && typeof obj.result === 'string') {
        return { text: obj.result, envelope: 'claude-code' };
      }
      // OpenAI Responses-style envelopes
      if (typeof obj.output_text === 'string') return { text: obj.output_text, envelope: 'openai' };
      if (Array.isArray(obj.choices) && obj.choices[0]?.message?.content) {
        return { text: obj.choices[0].message.content, envelope: 'openai-chat' };
      }
      // already an array/object that is the findings — let the parser handle it
    }
  } catch {}

  return { text: trimmed, envelope: null };
}

function tryParseFindings(text) {
  if (!text) return [];
  const candidates = [text];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidates.push(fenced[1].trim());

  const first = text.indexOf('[');
  const last = text.lastIndexOf(']');
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));

  const firstObj = text.indexOf('{');
  const lastObj = text.lastIndexOf('}');
  if (firstObj !== -1 && lastObj > firstObj) candidates.push(text.slice(firstObj, lastObj + 1));

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed.findings)) return parsed.findings;
      if (Array.isArray(parsed.results)) return parsed.results;
    } catch {}
  }
  return [];
}

function buildDiffFileLineMap(diff) {
  const fileLines = new Map();
  let currentFile = null;
  let newLine = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice('+++ b/'.length).trim();
      if (!fileLines.has(currentFile)) fileLines.set(currentFile, new Set());
    } else if (line.startsWith('@@')) {
      const m = line.match(/\+(\d+)(?:,(\d+))?/);
      if (m) newLine = parseInt(m[1], 10) - 1;
    } else if (currentFile) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        newLine++;
        fileLines.get(currentFile).add(newLine);
      } else if (line.startsWith(' ')) {
        newLine++;
        fileLines.get(currentFile).add(newLine);
      }
    }
  }
  return fileLines;
}

export async function runAgent({ reviewId, agentConfigId }) {
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(reviewId);
  const agent = db.prepare('SELECT * FROM agent_configs WHERE id = ?').get(agentConfigId);

  if (!review || !agent) {
    const reason = !review
      ? `review #${reviewId} not found`
      : `agent config #${agentConfigId} not found (was it deleted?)`;
    log.warn(`agent run pre-flight failed: ${reason}`);
    throw new Error(reason);
  }

  const runInfo = db
    .prepare(
      `INSERT INTO agent_runs (review_id, agent_config_id, agent_name, status, command) VALUES (?, ?, ?, 'running', ?)`
    )
    .run(reviewId, agentConfigId, agent.name, agent.command);
  const runId = runInfo.lastInsertRowid;

  const startedAt = Date.now();
  log.agent(`▶ run #${runId} agent="${agent.name}" review=${reviewId} cmd=${JSON.stringify(agent.command)}`);
  try {
    const diff = await getUnifiedDiff(review.worktree_path, review.base_sha, review.head_sha);
    const files = await getDiffFiles(review.worktree_path, review.base_sha, review.head_sha);
    const filePaths = files.map((f) => f.path).join('\n');

    const goalsBlock = agent.include_goals ? formatGoals() : '';
    const tpl = agent.prompt_template;
    /* If the template already references {{goals}}, fillTemplate will substitute.
       Otherwise, when goals are included, prepend the goals block so the user
       doesn't need to edit existing templates. */
    let prompt = fillTemplate(tpl, {
      diff,
      file_paths: filePaths,
      base: review.base_ref,
      head: review.head_ref,
      goals: goalsBlock,
    });
    if (agent.include_goals && goalsBlock && !tpl.includes('{{goals}}')) {
      prompt = goalsBlock + '\n' + prompt;
    }
    if (agent.include_goals) {
      log.agent(`run #${runId} including ${goalsBlock ? 'goals' : 'no enabled goals'}`);
    }

    db.prepare(`UPDATE agent_runs SET prompt = ? WHERE id = ?`).run(prompt, runId);

    const { code, stdout, stderr } = await runCommand(agent.command, prompt, review.worktree_path);

    const { text: effective, envelope } = unwrapEnvelope(stdout);
    if (envelope) log.agent(`run #${runId} unwrapped ${envelope} envelope (${effective.length}b inner)`);

    let findings = tryParseFindings(effective);
    /* Fallback: agent produced text but no JSON array — surface it so the user can see what happened. */
    if (findings.length === 0 && effective.trim()) {
      findings = [{
        file: null,
        line: null,
        severity: code === 0 ? 'info' : 'warn',
        message: `[agent did not return JSON findings — raw response below]\n\n${effective.trim()}`,
      }];
      log.warn(`run #${runId} produced no parseable findings; surfacing raw text (${effective.length}b)`);
    }
    const fileLines = buildDiffFileLineMap(diff);
    const insertFinding = db.prepare(
      `INSERT INTO agent_findings (agent_run_id, review_id, agent_name, file, line, severity, message, mapped)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertComment = db.prepare(
      `INSERT INTO comments (review_id, path, line, side, body, author, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    let mappedCount = 0;
    for (const f of findings) {
      const file = f.file || f.path || null;
      const line = f.line != null ? parseInt(f.line, 10) : null;
      const severity = f.severity || f.level || 'info';
      const message = f.message || f.text || f.body || JSON.stringify(f);
      const mappable = file && line && fileLines.has(file) && fileLines.get(file).has(line);
      insertFinding.run(runId, reviewId, agent.name, file, line, severity, message, mappable ? 1 : 0);
      if (mappable) {
        insertComment.run(
          reviewId,
          file,
          line,
          'right',
          `**[${severity.toUpperCase()}]** ${message}`,
          agent.name,
          `agent:${agent.name}`
        );
        mappedCount++;
      }
    }

    const durationMs = Date.now() - startedAt;
    db.prepare(
      `UPDATE agent_runs SET status = ?, finished_at = datetime('now'), stdout = ?, stderr = ?, exit_code = ?, duration_ms = ?, finding_count = ? WHERE id = ?`
    ).run(
      code === 0 ? 'success' : 'failed',
      stdout, stderr, code, durationMs, findings.length, runId
    );
    log.agent(
      `${code === 0 ? '✓' : '✗'} run #${runId} agent="${agent.name}" exit=${code} ` +
      `findings=${findings.length} mapped=${mappedCount} stdout=${stdout?.length || 0}b stderr=${stderr?.length || 0}b ` +
      `${(durationMs / 1000).toFixed(2)}s`
    );

    return { runId, findings: findings.length, mapped: mappedCount, code, stderr };
  } catch (e) {
    const durationMs = Date.now() - startedAt;
    db.prepare(
      `UPDATE agent_runs SET status = 'failed', finished_at = datetime('now'), stderr = ?, duration_ms = ? WHERE id = ?`
    ).run(String(e.message || e), durationMs, runId);
    log.error(`agent run #${runId} threw after ${durationMs}ms`, e);
    throw e;
  }
}
