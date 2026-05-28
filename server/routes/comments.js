import express from 'express';
import { db } from '../db.js';

const router = express.Router();

router.get('/', (req, res) => {
  const reviewId = req.query.review_id;
  if (!reviewId) return res.status(400).json({ error: 'review_id required' });
  const rows = db
    .prepare('SELECT * FROM comments WHERE review_id = ? ORDER BY created_at ASC')
    .all(reviewId);
  res.json(rows);
});

router.post('/', (req, res) => {
  const {
    review_id, parent_id, path, line, side, body,
    author = 'me', source = 'human', agent_fixable = 0,
  } = req.body || {};
  if (!review_id || !body) return res.status(400).json({ error: 'review_id and body required' });
  const info = db
    .prepare(
      `INSERT INTO comments (review_id, parent_id, path, line, side, body, author, source, agent_fixable)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      review_id, parent_id || null, path || null, line || null, side || null,
      body, author, source, agent_fixable ? 1 : 0
    );
  const c = db.prepare('SELECT * FROM comments WHERE id = ?').get(info.lastInsertRowid);
  res.json(c);
});

router.patch('/:id', (req, res) => {
  const { body, resolved, agent_fixable, fix_status } = req.body || {};
  const fields = [];
  const args = [];
  if (body !== undefined) { fields.push('body = ?'); args.push(body); }
  if (resolved !== undefined) { fields.push('resolved = ?'); args.push(resolved ? 1 : 0); }
  if (agent_fixable !== undefined) { fields.push('agent_fixable = ?'); args.push(agent_fixable ? 1 : 0); }
  if (fix_status !== undefined) {
    fields.push('fix_status = ?'); args.push(fix_status);
    if (fix_status === null) {
      fields.push('fix_commit_sha = NULL', 'fix_run_id = NULL', 'fixed_at = NULL');
    }
  }
  if (!fields.length) return res.json({ ok: true });
  args.push(req.params.id);
  db.prepare(`UPDATE comments SET ${fields.join(', ')} WHERE id = ?`).run(...args);
  const c = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
  res.json(c);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
