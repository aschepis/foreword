import simpleGit from 'simple-git';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

export function gitAt(repoPath) {
  return simpleGit({ baseDir: repoPath, binary: 'git', maxConcurrentProcesses: 4 });
}

export async function isGitRepo(p) {
  try {
    if (!fs.existsSync(p)) return false;
    const git = gitAt(p);
    const result = await git.checkIsRepo();
    return !!result;
  } catch {
    return false;
  }
}

export async function repoName(p) {
  return path.basename(path.resolve(p));
}

export async function enumerateWorktrees(repoPath) {
  const git = gitAt(repoPath);
  const out = await git.raw(['worktree', 'list', '--porcelain']);
  const blocks = out.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  const result = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const wt = { path: null, branch: null, head: null, bare: false };
    for (const line of lines) {
      if (line.startsWith('worktree ')) wt.path = line.slice('worktree '.length);
      else if (line.startsWith('HEAD ')) wt.head = line.slice('HEAD '.length);
      else if (line.startsWith('branch ')) wt.branch = line.slice('branch '.length).replace('refs/heads/', '');
      else if (line === 'bare') wt.bare = true;
    }
    if (wt.path) result.push(wt);
  }
  return result;
}

export async function listBranches(repoPath) {
  const git = gitAt(repoPath);
  const local = await git.branchLocal();
  const all = await git.branch(['-a']);
  const branches = new Set();
  for (const b of Object.keys(local.branches)) branches.add(b);
  for (const b of Object.keys(all.branches)) {
    const clean = b.replace(/^remotes\//, '');
    if (!clean.startsWith('origin/HEAD')) branches.add(clean);
  }
  return {
    current: local.current,
    branches: [...branches].sort(),
  };
}

export async function detectDefaultBranch(repoPath) {
  const git = gitAt(repoPath);
  for (const candidate of ['main', 'master', 'trunk', 'develop']) {
    try {
      await git.revparse(['--verify', candidate]);
      return candidate;
    } catch {}
  }
  try {
    const out = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD']);
    return out.trim().replace('refs/remotes/origin/', '');
  } catch {}
  return 'main';
}

export async function resolveSha(repoPath, ref) {
  const git = gitAt(repoPath);
  return (await git.revparse([ref])).trim();
}

export async function mergeBase(repoPath, a, b) {
  const git = gitAt(repoPath);
  try {
    const out = await git.raw(['merge-base', a, b]);
    return out.trim();
  } catch {
    return null;
  }
}

/**
 * Detect whether the worktree's HEAD has drifted from a stored sha.
 *
 *   none      stored === current
 *   ahead     stored is reachable from current (linear advance) — new_commits > 0
 *   diverged  stored is NOT reachable from current (rebase, amend, reset, or
 *             stored is a dangling/missing object)
 *
 * Approach: count commits in both directions with `rev-list --count`. If the
 * "behind" count > 0, the stored sha has commits the current HEAD doesn't —
 * i.e. the branch was rewritten. `merge-base --is-ancestor` would be cleaner
 * but simple-git swallows its exit-1 signal.
 */
export async function detectHeadDrift(repoPath, storedHeadSha, headRef) {
  const git = gitAt(repoPath);
  let currentHeadSha;
  try {
    currentHeadSha = (await git.revparse(['HEAD'])).trim();
  } catch {
    return { drift: 'unknown', stored_head_sha: storedHeadSha, current_head_sha: null, new_commits: 0 };
  }

  if (currentHeadSha === storedHeadSha) {
    return { drift: 'none', stored_head_sha: storedHeadSha, current_head_sha: currentHeadSha, new_commits: 0 };
  }

  /* If stored isn't a known object at all (gc'd / never existed), treat as diverged. */
  try {
    await git.raw(['cat-file', '-e', storedHeadSha]);
  } catch {
    return {
      drift: 'diverged',
      stored_head_sha: storedHeadSha,
      current_head_sha: currentHeadSha,
      new_commits: 0,
      head_ref: headRef,
    };
  }

  async function count(range) {
    try {
      const out = await git.raw(['rev-list', '--count', range]);
      return parseInt(out.trim(), 10) || 0;
    } catch { return 0; }
  }
  const ahead  = await count(`${storedHeadSha}..${currentHeadSha}`);
  const behind = await count(`${currentHeadSha}..${storedHeadSha}`);

  /* Behind > 0 means stored has commits unreachable from current ⇒ rewritten. */
  if (behind > 0) {
    return {
      drift: 'diverged',
      stored_head_sha: storedHeadSha,
      current_head_sha: currentHeadSha,
      new_commits: ahead,
      behind_commits: behind,
      head_ref: headRef,
    };
  }

  return {
    drift: 'ahead',
    stored_head_sha: storedHeadSha,
    current_head_sha: currentHeadSha,
    new_commits: ahead,
    head_ref: headRef,
  };
}

export async function getUnifiedDiff(repoPath, baseRef, headRef, { ignoreWhitespace = false } = {}) {
  const git = gitAt(repoPath);
  const args = ['diff', '--no-color', '--no-ext-diff', '--unified=3'];
  if (ignoreWhitespace) args.push('-w');
  args.push(`${baseRef}...${headRef}`);
  return git.raw(args);
}

export async function getDiffFiles(repoPath, baseRef, headRef) {
  const git = gitAt(repoPath);
  const out = await git.raw(['diff', '--numstat', `${baseRef}...${headRef}`]);
  const files = [];
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const [add, del, ...rest] = line.split('\t');
    const file = rest.join('\t');
    files.push({
      path: file,
      additions: add === '-' ? 0 : parseInt(add, 10) || 0,
      deletions: del === '-' ? 0 : parseInt(del, 10) || 0,
    });
  }
  return files;
}

export async function getFileContentSha(repoPath, ref, file) {
  const git = gitAt(repoPath);
  try {
    const out = await git.raw(['ls-tree', ref, '--', file]);
    const parts = out.trim().split(/\s+/);
    return parts[2] || null;
  } catch {
    return null;
  }
}

export async function listCommitsBetween(repoPath, baseRef, headRef) {
  const git = gitAt(repoPath);
  const out = await git.raw([
    'log',
    '--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s',
    `${baseRef}..${headRef}`,
  ]);
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, short, author, email, date, subject] = line.split('\x1f');
      return { hash, short, author, email, date, subject };
    })
    .reverse();
}

export async function diffForCommit(repoPath, sha, { mode = 'single', baseRef, ignoreWhitespace = false } = {}) {
  const git = gitAt(repoPath);
  const args = ['diff', '--no-color', '--no-ext-diff', '--unified=3'];
  if (ignoreWhitespace) args.push('-w');
  if (mode === 'single') {
    args.push(`${sha}^!`);
  } else {
    args.push(`${baseRef}...${sha}`);
  }
  return git.raw(args);
}

export function fileExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

export function shortSha(s) {
  return s ? s.slice(0, 7) : '';
}

export function hash(s) {
  return crypto.createHash('sha1').update(s).digest('hex');
}
