/**
 * MCP tool implementations. Each tool is a small async function that
 * leans on the same DB / git helpers the HTTP routes use, so behavior
 * matches the UI exactly.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { db } from '../db.js';
import {
  isGitRepo,
  repoName,
  enumerateWorktrees,
  detectDefaultBranch,
  resolveSha,
  mergeBase,
} from '../git.js';
import { openBrowser } from '../lib/open-browser.js';
import { buildThreadContext } from '../services/fix-runner.js';
import { log } from '../log.js';

function publicBaseUrl() {
  return process.env.FOREWORD_PUBLIC_URL || `http://localhost:${process.env.PORT || 3200}`;
}

/* ─── create_review ──────────────────────────────────────────────── */

/**
 * Auto-register a repo if it isn't tracked yet. Mirrors POST /api/repos.
 */
function expandTilde(p) {
  if (!p.startsWith('~')) return p;
  const home = os.homedir();
  if (!home) {
    throw new Error(`cannot expand "~" — homedir is not available on this system`);
  }
  return path.join(home, p.slice(1));
}

async function ensureRepoRegistered(repoPath) {
  const abs = path.resolve(expandTilde(repoPath));
  if (!(await isGitRepo(abs))) {
    throw new Error(`${abs} is not a git repository`);
  }

  /* Fast path: already registered, no work to do. */
  const existing = db.prepare('SELECT * FROM repos WHERE path = ?').get(abs);
  if (existing) return existing;

  /* Async git operations happen outside the transaction; better-sqlite3
     transactions are synchronous and shouldn't span awaits. */
  const name = await repoName(abs);
  const defaultBranch = await detectDefaultBranch(abs);
  const wts = await enumerateWorktrees(abs);

  /* Race-safe registration: INSERT OR IGNORE + SELECT inside a single
     transaction. If two callers race, the loser's INSERT no-ops and
     SELECT returns the winner's row; worktrees are populated only on
     the winning side (info.changes === 1). The schema's UNIQUE(path)
     on repos provides the atomicity guarantee. */
  const tx = db.transaction(() => {
    const info = db
      .prepare('INSERT OR IGNORE INTO repos (path, name, default_branch) VALUES (?, ?, ?)')
      .run(abs, name, defaultBranch);
    const row = db.prepare('SELECT * FROM repos WHERE path = ?').get(abs);
    if (info.changes > 0) {
      const ins = db.prepare('INSERT INTO worktrees (repo_id, path, branch, is_main) VALUES (?, ?, ?, ?)');
      for (const wt of wts) ins.run(row.id, wt.path, wt.branch, wt.path === abs ? 1 : 0);
    }
    return { row, inserted: info.changes > 0 };
  });
  const { row, inserted } = tx();
  if (inserted) {
    log.info(`MCP auto-registered repo ${abs} (#${row.id})`);
  }
  return row;
}

export async function createReview({ repo_path, base_ref, head_ref, worktree_path, launch = true }) {
  if (!repo_path) throw new Error('repo_path is required');
  if (!head_ref) throw new Error('head_ref is required (the branch you want reviewed)');

  const repo = await ensureRepoRegistered(repo_path);
  const wtPath = worktree_path || repo.path;
  const defaultBranch = repo.default_branch || (await detectDefaultBranch(wtPath));
  const baseRef = base_ref || defaultBranch;

  const headSha = await resolveSha(wtPath, head_ref);
  const mb = await mergeBase(wtPath, baseRef, head_ref);
  const baseSha = mb || (await resolveSha(wtPath, baseRef));
  const sessionId = randomUUID();

  const info = db
    .prepare(
      `INSERT INTO reviews (repo_id, worktree_path, base_ref, head_ref, base_sha, head_sha, mcp_session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(repo.id, wtPath, baseRef, head_ref, baseSha, headSha, sessionId);

  const reviewId = info.lastInsertRowid;
  const url = `${publicBaseUrl()}/reviews/${reviewId}`;
  if (launch) openBrowser(url);
  log.info(`MCP created review #${reviewId} ${baseRef}…${head_ref} session=${sessionId} launched=${launch}`);

  return {
    review_id: reviewId,
    url,
    repo_id: repo.id,
    head_sha: headSha,
    base_sha: baseSha,
    base_ref: baseRef,
    head_ref,
    mcp_session_id: sessionId,
    launched: !!launch,
  };
}

/* ─── list_comments ──────────────────────────────────────────────── */

export async function listComments({ review_id, filter = 'all' }) {
  if (!review_id) throw new Error('review_id is required');
  const review = db.prepare('SELECT id FROM reviews WHERE id = ?').get(review_id);
  if (!review) throw new Error(`review #${review_id} not found`);

  let rows = db
    .prepare('SELECT * FROM comments WHERE review_id = ? ORDER BY id ASC')
    .all(review_id);

  switch (filter) {
    case 'fixable_pending':
      rows = rows.filter((c) =>
        c.agent_fixable && (c.fix_status == null || c.fix_status === 'skipped' || c.fix_status === 'failed')
      );
      break;
    case 'human':
      rows = rows.filter((c) => !c.source || c.source === 'human');
      break;
    case 'agent_findings':
      rows = rows.filter((c) => c.source && c.source.startsWith('agent:'));
      break;
    case 'all':
    default:
      break;
  }

  return { review_id, filter, count: rows.length, comments: rows };
}

/* ─── get_fixable_work ───────────────────────────────────────────── */

export async function getFixableWork({ review_id }) {
  if (!review_id) throw new Error('review_id is required');
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(review_id);
  if (!review) throw new Error(`review #${review_id} not found`);

  const pending = db
    .prepare(
      `SELECT * FROM comments
       WHERE review_id = ?
         AND agent_fixable = 1
         AND (fix_status IS NULL OR fix_status = 'skipped' OR fix_status = 'failed')
       ORDER BY id ASC`
    )
    .all(review_id);

  const items = pending.map((c) => ({
    comment_id: c.id,
    file: c.path,
    line: c.line,
    side: c.side,
    body: c.body,
    fix_status: c.fix_status,
    thread_markdown: buildThreadContext(c),
  }));

  return {
    review_id,
    review_url: `${publicBaseUrl()}/reviews/${review_id}`,
    worktree_path: review.worktree_path,
    base_ref: review.base_ref,
    head_ref: review.head_ref,
    head_sha: review.head_sha,
    base_sha: review.base_sha,
    count: items.length,
    items,
  };
}

/* ─── mark_comment_fixed ─────────────────────────────────────────── */

export async function markCommentFixed({ comment_id, commit_sha, message }) {
  if (!comment_id) throw new Error('comment_id is required');
  const existing = db.prepare('SELECT * FROM comments WHERE id = ?').get(comment_id);
  if (!existing) throw new Error(`comment #${comment_id} not found`);

  db.prepare(
    `UPDATE comments
        SET fix_status = 'fixed',
            fix_commit_sha = ?,
            fixed_at = ?
      WHERE id = ?`
  ).run(commit_sha || null, new Date().toISOString(), comment_id);

  const updated = db.prepare('SELECT * FROM comments WHERE id = ?').get(comment_id);
  log.info(
    `MCP marked comment #${comment_id} fixed${commit_sha ? ` sha=${commit_sha.slice(0,7)}` : ''}` +
    `${message ? ` "${message.slice(0, 80)}"` : ''}`
  );
  return { comment: updated };
}

/* ─── wait_for_review_signal ─────────────────────────────────────── */

/**
 * Long-poll on reviews.signaled_at. Returns when:
 *   - signaled_at is non-null AND newer than the wait start, OR
 *   - the timeout elapses.
 *
 * Always queries by review id (not session id) since the session id is
 * already validated at create time and is just a routing aid for the UI.
 */
export async function waitForReviewSignal({ review_id, timeout_seconds = 300 }) {
  if (!review_id) throw new Error('review_id is required');
  const review = db.prepare('SELECT id, mcp_session_id, signaled_at FROM reviews WHERE id = ?').get(review_id);
  if (!review) throw new Error(`review #${review_id} not found`);
  if (!review.mcp_session_id) {
    throw new Error(`review #${review_id} was not created via MCP — cannot wait`);
  }

  /* Cap timeout. Agent can re-call after it expires. */
  const timeoutMs = Math.min(Math.max(timeout_seconds, 1), 600) * 1000;
  const startedAt = Date.now();
  const baselineSignaledAt = review.signaled_at;

  /* Polling cadence: 750ms is responsive enough to feel snappy without
     pegging the SQLite handle. */
  while (Date.now() - startedAt < timeoutMs) {
    const fresh = db
      .prepare('SELECT signaled_at FROM reviews WHERE id = ?')
      .get(review_id);
    if (fresh?.signaled_at && fresh.signaled_at !== baselineSignaledAt) {
      return buildSignalReturn(review_id, fresh.signaled_at, /* signaled */ true);
    }
    await new Promise((r) => setTimeout(r, 750));
  }

  /* Timeout — return cleanly so the agent can choose to re-call. */
  return buildSignalReturn(review_id, baselineSignaledAt, /* signaled */ false);
}

function buildSignalReturn(reviewId, signaledAt, signaled) {
  const review = db.prepare('SELECT head_sha FROM reviews WHERE id = ?').get(reviewId);
  const counts = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN agent_fixable = 1 AND (fix_status IS NULL OR fix_status IN ('skipped','failed')) THEN 1 ELSE 0 END) AS fixable_pending,
         SUM(CASE WHEN fix_status = 'fixed' THEN 1 ELSE 0 END) AS fixed
       FROM comments WHERE review_id = ?`
    )
    .get(reviewId);
  return {
    signaled,
    signaled_at: signaledAt || null,
    summary: {
      total_comments: counts.total || 0,
      fixable_pending: counts.fixable_pending || 0,
      fixed: counts.fixed || 0,
      head_sha: review.head_sha,
    },
  };
}
