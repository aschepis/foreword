import { db } from '../db.js';
import { gitAt, getDiffFiles } from '../git.js';
import path from 'node:path';

function isTestFile(p) {
  return /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[a-zA-Z]+$|_test\.[a-zA-Z]+$/.test(p);
}

async function churnFor(repoPath, file) {
  const git = gitAt(repoPath);
  try {
    const out = await git.raw([
      'log',
      '--since=90.days',
      '--pretty=oneline',
      '--',
      file,
    ]);
    return out.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

async function fanInFor(repoPath, file) {
  const git = gitAt(repoPath);
  const base = path.basename(file).replace(/\.[a-zA-Z]+$/, '');
  if (!base || base.length < 3) return 0;
  try {
    const out = await git.raw(['grep', '-l', '-w', '-F', base, '--', ':(exclude)' + file]);
    return out.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

export async function computeRisk(reviewId) {
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(reviewId);
  if (!review) throw new Error('review not found');

  const files = await getDiffFiles(review.worktree_path, review.base_sha, review.head_sha);
  const testTouched = files.filter((f) => isTestFile(f.path)).map((f) => f.path);

  const findingsByFile = db
    .prepare(
      `SELECT file, COUNT(DISTINCT agent_name) AS agent_count, COUNT(*) AS finding_count
       FROM agent_findings WHERE review_id = ? AND file IS NOT NULL GROUP BY file`
    )
    .all(reviewId);
  const findingMap = new Map(findingsByFile.map((r) => [r.file, r]));

  const results = [];
  for (const f of files) {
    if (isTestFile(f.path)) continue;
    const size = f.additions + f.deletions;
    const churn = await churnFor(review.worktree_path, f.path);
    const fanIn = await fanInFor(review.worktree_path, f.path);

    const dir = path.dirname(f.path);
    const baseName = path.basename(f.path).replace(/\.[a-zA-Z]+$/, '');
    const hasTestCompanion = testTouched.some(
      (t) => t.includes(baseName) || t.startsWith(dir)
    );

    const fm = findingMap.get(f.path);
    const agentCount = fm ? fm.agent_count : 0;
    const findingCount = fm ? fm.finding_count : 0;

    const sizeScore = Math.min(1, size / 200);
    const churnScore = Math.min(1, churn / 30);
    const fanScore = Math.min(1, fanIn / 50);
    const noTestPenalty = size > 20 && !hasTestCompanion ? 0.5 : 0;
    const agentScore = Math.min(1, (agentCount * 0.4) + (findingCount * 0.1));

    const score =
      sizeScore * 0.25 +
      churnScore * 0.2 +
      fanScore * 0.2 +
      noTestPenalty * 0.15 +
      agentScore * 0.2;

    let level = 'low';
    if (score >= 0.65) level = 'high';
    else if (score >= 0.35) level = 'medium';

    results.push({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      size,
      churn,
      fanIn,
      hasTestCompanion,
      agentCount,
      findingCount,
      score: Math.round(score * 100) / 100,
      level,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return { files: results, testFiles: testTouched };
}
