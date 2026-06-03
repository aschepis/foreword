import express from 'express';
import { db } from '../db.js';
import { resolveSha, mergeBase, detectDefaultBranch, detectHeadDrift } from '../git.js';
import { log } from '../log.js';

const router = express.Router();

router.get('/', (req, res) => {
  const repoId = req.query.repo_id;
  const where = repoId ? 'WHERE repo_id = ?' : '';
  const args = repoId ? [repoId] : [];
  const rows = db.prepare(`SELECT * FROM reviews ${where} ORDER BY created_at DESC LIMIT 100`).all(...args);
  res.json(rows);
});

router.post('/', async (req, res, next) => {
  try {
    const { repo_id, worktree_path, base_ref, head_ref } = req.body || {};
    if (!repo_id || !head_ref) return res.status(400).json({ error: 'repo_id and head_ref required' });

    const repo = db.prepare('SELECT * FROM repos WHERE id = ?').get(repo_id);
    if (!repo) return res.status(404).json({ error: 'repo not found' });

    const wtPath = worktree_path || repo.path;
    const defaultBranch = repo.default_branch || (await detectDefaultBranch(wtPath));
    const baseRef = base_ref || defaultBranch;

    let baseSha;
    try {
      const headSha = await resolveSha(wtPath, head_ref);
      const mb = await mergeBase(wtPath, baseRef, head_ref);
      baseSha = mb || (await resolveSha(wtPath, baseRef));
      const info = db
        .prepare(
          `INSERT INTO reviews (repo_id, worktree_path, base_ref, head_ref, base_sha, head_sha)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(repo_id, wtPath, baseRef, head_ref, baseSha, headSha);
      const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(info.lastInsertRowid);
      res.json(review);
    } catch (e) {
      return res.status(400).json({ error: `Failed to resolve refs: ${e.message}` });
    }
  } catch (e) { next(e); }
});

router.get('/:id', (req, res) => {
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!review) return res.status(404).json({ error: 'review not found' });
  const repo = db.prepare('SELECT * FROM repos WHERE id = ?').get(review.repo_id);
  res.json({ ...review, repo });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/files/:path(*)/reviewed', (req, res) => {
  const { id, path: filePath } = req.params;
  const { reviewed_sha } = req.body || {};
  if (!reviewed_sha) return res.status(400).json({ error: 'reviewed_sha required' });
  db.prepare(
    `INSERT INTO file_reviewed (review_id, path, reviewed_sha)
     VALUES (?, ?, ?)
     ON CONFLICT(review_id, path) DO UPDATE SET reviewed_sha = excluded.reviewed_sha, reviewed_at = datetime('now')`
  ).run(id, filePath, reviewed_sha);
  res.json({ ok: true });
});

router.delete('/:id/files/:path(*)/reviewed', (req, res) => {
  const { id, path: filePath } = req.params;
  db.prepare('DELETE FROM file_reviewed WHERE review_id = ? AND path = ?').run(id, filePath);
  res.json({ ok: true });
});

router.get('/:id/reviewed', (req, res) => {
  const rows = db.prepare('SELECT * FROM file_reviewed WHERE review_id = ?').all(req.params.id);
  res.json(rows);
});

/**
 * Hand the review back to the MCP-connected agent that opened it.
 * Sets signaled_at to now; the agent's wait_for_review_signal long-poll
 * returns on the next tick. No-op shape if no agent is waiting (the
 * column just stays set; next wait cycle re-baselines).
 */
router.post('/:id/signal', (req, res) => {
  const review = db.prepare('SELECT id, mcp_session_id FROM reviews WHERE id = ?').get(req.params.id);
  if (!review) return res.status(404).json({ error: 'review not found' });
  if (!review.mcp_session_id) {
    return res.status(400).json({ error: 'this review was not created via MCP — nothing to signal' });
  }
  db.prepare(`UPDATE reviews SET signaled_at = datetime('now') WHERE id = ?`).run(review.id);
  const fresh = db.prepare('SELECT signaled_at FROM reviews WHERE id = ?').get(review.id);
  log.info(`review #${review.id} signaled to agent at ${fresh.signaled_at}`);
  res.json({ ok: true, signaled_at: fresh.signaled_at });
});

/**
 * Inspect whether the worktree's HEAD has moved since the review was created.
 * Returns drift info without modifying anything. Frontend polls this.
 */
router.get('/:id/head-state', async (req, res, next) => {
  try {
    const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
    if (!review) return res.status(404).json({ error: 'review not found' });
    const state = await detectHeadDrift(review.worktree_path, review.head_sha, review.head_ref);
    res.json(state);
  } catch (e) { next(e); }
});

/**
 * Advance the review's stored head_sha to the worktree's current HEAD.
 * No-op if already in sync. Returns the new state. base_sha stays frozen
 * so the review continues diffing against the same starting point.
 */
router.post('/:id/refresh-head', async (req, res, next) => {
  try {
    const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
    if (!review) return res.status(404).json({ error: 'review not found' });
    const state = await detectHeadDrift(review.worktree_path, review.head_sha, review.head_ref);
    if (state.drift === 'unknown' || !state.current_head_sha) {
      return res.status(400).json({ error: 'could not resolve HEAD in worktree', state });
    }
    if (state.drift === 'none') {
      return res.json({ updated: false, state });
    }
    db.prepare('UPDATE reviews SET head_sha = ? WHERE id = ?').run(state.current_head_sha, review.id);
    log.info(`review #${review.id} head_sha refreshed ${state.stored_head_sha.slice(0,7)} -> ${state.current_head_sha.slice(0,7)} (${state.drift})`);
    res.json({ updated: true, previous_head_sha: state.stored_head_sha, state: { ...state, drift: 'none', stored_head_sha: state.current_head_sha } });
  } catch (e) { next(e); }
});

export default router;
