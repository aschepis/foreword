import express from 'express';
import { db } from '../db.js';
import {
  getUnifiedDiff,
  getDiffFiles,
  listCommitsBetween,
  diffForCommit,
  getFileContentSha,
} from '../git.js';

const router = express.Router();

function getReview(id) {
  return db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
}

router.get('/:id/diff', async (req, res, next) => {
  try {
    const review = getReview(req.params.id);
    if (!review) return res.status(404).json({ error: 'review not found' });
    const ignoreWhitespace = req.query.w === '1' || req.query.w === 'true';
    const baseRef = req.query.base_sha || review.base_sha;
    const headRef = req.query.head_sha || review.head_sha;
    const diff = await getUnifiedDiff(review.worktree_path, baseRef, headRef, { ignoreWhitespace });
    const files = await getDiffFiles(review.worktree_path, baseRef, headRef);
    const shas = {};
    for (const f of files) {
      shas[f.path] = await getFileContentSha(review.worktree_path, headRef, f.path);
    }
    res.json({ diff, files, head_sha: headRef, base_sha: baseRef, file_shas: shas });
  } catch (e) { next(e); }
});

router.get('/:id/commits', async (req, res, next) => {
  try {
    const review = getReview(req.params.id);
    if (!review) return res.status(404).json({ error: 'review not found' });
    const commits = await listCommitsBetween(review.worktree_path, review.base_sha, review.head_sha);
    res.json(commits);
  } catch (e) { next(e); }
});

router.get('/:id/commit-diff', async (req, res, next) => {
  try {
    const review = getReview(req.params.id);
    if (!review) return res.status(404).json({ error: 'review not found' });
    const { sha, mode } = req.query;
    if (!sha) return res.status(400).json({ error: 'sha required' });
    const ignoreWhitespace = req.query.w === '1' || req.query.w === 'true';
    const diff = await diffForCommit(review.worktree_path, sha, {
      mode: mode === 'cumulative' ? 'cumulative' : 'single',
      baseRef: review.base_sha,
      ignoreWhitespace,
    });
    res.json({ diff });
  } catch (e) { next(e); }
});

export default router;
