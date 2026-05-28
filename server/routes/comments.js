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
  const { review_id, parent_id, path, line, side, body, author = 'me', source = 'human' } = req.body || {};
  if (!review_id || !body) return res.status(400).json({ error: 'review_id and body required' });
  const info = db
    .prepare(
      `INSERT INTO comments (review_id, parent_id, path, line, side, body, author, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(review_id, parent_id || null, path || null, line || null, side || null, body, author, source);
  const c = db.prepare('SELECT * FROM comments WHERE id = ?').get(info.lastInsertRowid);
  res.json(c);
});

router.patch('/:id', (req, res) => {
  const { body, resolved } = req.body || {};
  const fields = [];
  const args = [];
  if (body !== undefined) { fields.push('body = ?'); args.push(body); }
  if (resolved !== undefined) { fields.push('resolved = ?'); args.push(resolved ? 1 : 0); }
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
