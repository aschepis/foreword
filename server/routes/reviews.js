import express from 'express';
import { db } from '../db.js';
import { resolveSha, mergeBase, detectDefaultBranch } from '../git.js';

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

export default router;
