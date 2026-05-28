import express from 'express';
import { db } from '../db.js';
import { log } from '../log.js';

const router = express.Router();

router.get('/stats', (req, res) => {
  const counts = {};
  for (const t of ['repos', 'worktrees', 'reviews', 'file_reviewed', 'comments',
                   'agent_configs', 'agent_runs', 'agent_findings', 'goals']) {
    counts[t] = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
  }
  res.json(counts);
});

router.post('/clear-reviews', (req, res) => {
  /* Deletes ALL reviews + their cascades (file_reviewed, comments, agent_runs, agent_findings).
     Keeps repos, worktrees, agent_configs, settings. */
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM agent_findings').run();
    db.prepare('DELETE FROM agent_runs').run();
    db.prepare('DELETE FROM comments').run();
    db.prepare('DELETE FROM file_reviewed').run();
    db.prepare('DELETE FROM reviews').run();
  });
  tx();
  log.warn('admin: cleared all reviews (kept repos + agent configs + settings)');
  res.json({ ok: true });
});

router.post('/clear-all', (req, res) => {
  /* Nuclear: wipe every table. Schema stays — db file is preserved. */
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM agent_findings').run();
    db.prepare('DELETE FROM agent_runs').run();
    db.prepare('DELETE FROM agent_configs').run();
    db.prepare('DELETE FROM comments').run();
    db.prepare('DELETE FROM file_reviewed').run();
    db.prepare('DELETE FROM reviews').run();
    db.prepare('DELETE FROM worktrees').run();
    db.prepare('DELETE FROM repos').run();
    db.prepare('DELETE FROM goals').run();
    db.prepare('DELETE FROM settings').run();
  });
  tx();
  log.warn('admin: wiped ALL data (clean slate)');
  res.json({ ok: true });
});

export default router;
