import express from 'express';
import { db } from '../db.js';

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM goals ORDER BY sort_order ASC, id ASC')
    .all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { title, body = '', enabled = 1 } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'title required' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM goals').get().m;
  const info = db
    .prepare('INSERT INTO goals (title, body, enabled, sort_order) VALUES (?, ?, ?, ?)')
    .run(title.trim(), body, enabled ? 1 : 0, maxOrder + 1);
  res.json(db.prepare('SELECT * FROM goals WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/:id', (req, res) => {
  const fields = [];
  const args = [];
  for (const k of ['title', 'body', 'enabled', 'sort_order']) {
    if (k in (req.body || {})) {
      fields.push(`${k} = ?`);
      args.push(k === 'enabled' ? (req.body[k] ? 1 : 0) : req.body[k]);
    }
  }
  if (!fields.length) return res.json({ ok: true });
  fields.push("updated_at = datetime('now')");
  args.push(req.params.id);
  db.prepare(`UPDATE goals SET ${fields.join(', ')} WHERE id = ?`).run(...args);
  res.json(db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM goals WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
