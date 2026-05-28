import express from 'express';
import path from 'node:path';
import { db } from '../db.js';
import {
  isGitRepo,
  repoName,
  enumerateWorktrees,
  listBranches,
  detectDefaultBranch,
} from '../git.js';

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM repos ORDER BY created_at DESC').all();
  res.json(rows);
});

router.post('/', async (req, res, next) => {
  try {
    const { path: rawPath } = req.body || {};
    if (!rawPath) return res.status(400).json({ error: 'path required' });
    const abs = path.resolve(rawPath.replace(/^~/, process.env.HOME || ''));
    if (!(await isGitRepo(abs))) {
      return res.status(400).json({ error: `${abs} is not a git repository` });
    }
    const name = await repoName(abs);
    const defaultBranch = await detectDefaultBranch(abs);

    const existing = db.prepare('SELECT * FROM repos WHERE path = ?').get(abs);
    let repo;
    if (existing) {
      repo = existing;
    } else {
      const info = db
        .prepare('INSERT INTO repos (path, name, default_branch) VALUES (?, ?, ?)')
        .run(abs, name, defaultBranch);
      repo = db.prepare('SELECT * FROM repos WHERE id = ?').get(info.lastInsertRowid);
    }

    const wts = await enumerateWorktrees(abs);
    db.prepare('DELETE FROM worktrees WHERE repo_id = ?').run(repo.id);
    const insertWt = db.prepare(
      'INSERT INTO worktrees (repo_id, path, branch, is_main) VALUES (?, ?, ?, ?)'
    );
    for (const wt of wts) {
      insertWt.run(repo.id, wt.path, wt.branch, wt.path === abs ? 1 : 0);
    }

    res.json({ ...repo, worktrees: wts });
  } catch (e) { next(e); }
});

router.get('/:id', (req, res) => {
  const repo = db.prepare('SELECT * FROM repos WHERE id = ?').get(req.params.id);
  if (!repo) return res.status(404).json({ error: 'repo not found' });
  const worktrees = db.prepare('SELECT * FROM worktrees WHERE repo_id = ?').all(repo.id);
  res.json({ ...repo, worktrees });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM repos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/:id/branches', async (req, res, next) => {
  try {
    const repo = db.prepare('SELECT * FROM repos WHERE id = ?').get(req.params.id);
    if (!repo) return res.status(404).json({ error: 'repo not found' });
    const wtPath = req.query.worktree || repo.path;
    const result = await listBranches(wtPath);
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/:id/refresh', async (req, res, next) => {
  try {
    const repo = db.prepare('SELECT * FROM repos WHERE id = ?').get(req.params.id);
    if (!repo) return res.status(404).json({ error: 'repo not found' });
    const wts = await enumerateWorktrees(repo.path);
    db.prepare('DELETE FROM worktrees WHERE repo_id = ?').run(repo.id);
    const ins = db.prepare('INSERT INTO worktrees (repo_id, path, branch, is_main) VALUES (?, ?, ?, ?)');
    for (const wt of wts) ins.run(repo.id, wt.path, wt.branch, wt.path === repo.path ? 1 : 0);
    res.json({ ok: true, worktrees: wts });
  } catch (e) { next(e); }
});

export default router;
