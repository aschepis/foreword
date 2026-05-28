import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';

export default function RepoView() {
  const { repoId } = useParams();
  const nav = useNavigate();
  const [repo, setRepo] = useState(null);
  const [branches, setBranches] = useState(null);
  const [worktree, setWorktree] = useState('');
  const [baseRef, setBaseRef] = useState('');
  const [headRef, setHeadRef] = useState('');
  const [reviews, setReviews] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function loadRepo() {
    const r = await api.repos.get(repoId);
    setRepo(r);
    const mainWt = r.worktrees?.find((w) => w.is_main) || r.worktrees?.[0];
    setWorktree(mainWt?.path || r.path);
  }

  async function loadReviews() {
    setReviews(await api.reviews.list(repoId));
  }

  useEffect(() => { loadRepo(); loadReviews(); }, [repoId]);

  useEffect(() => {
    if (!worktree || !repo) return;
    api.repos.branches(repo.id, worktree).then((b) => {
      setBranches(b);
      if (b.current) setHeadRef(b.current);
      setBaseRef((cur) => cur || repo.default_branch || 'main');
    });
  }, [worktree, repo]);

  async function startReview(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const review = await api.reviews.create({
        repo_id: repo.id,
        worktree_path: worktree,
        base_ref: baseRef,
        head_ref: headRef,
      });
      nav(`/reviews/${review.id}`);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function refresh() {
    await api.repos.refresh(repoId);
    loadRepo();
  }

  if (!repo) return <div className="p-6 text-text-muted">Loading…</div>;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-4 text-text-muted text-sm"><Link to="/" className="hover:text-accent">← repos</Link></div>
      <h1 className="text-xl">{repo.name}</h1>
      <div className="text-xs text-text-muted font-mono mb-6">{repo.path}</div>

      <div className="bg-bg-soft border border-bg-line rounded p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Start a review</h2>
          <button onClick={refresh} className="text-xs text-text-muted hover:text-accent">refresh worktrees</button>
        </div>
        <form onSubmit={startReview} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <label className="block">
            <div className="text-xs text-text-muted mb-1">Worktree</div>
            <select className="bg-bg border border-bg-line rounded px-2 py-1.5 w-full text-sm"
                    value={worktree} onChange={(e) => setWorktree(e.target.value)}>
              {repo.worktrees?.map((w) => (
                <option key={w.path} value={w.path}>
                  {w.path === repo.path ? '(main) ' : ''}{w.path}{w.branch ? ` — ${w.branch}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="text-xs text-text-muted mb-1">Base</div>
            <input list="branches" className="bg-bg border border-bg-line rounded px-2 py-1.5 w-full text-sm font-mono"
                   value={baseRef} onChange={(e) => setBaseRef(e.target.value)} placeholder={repo.default_branch || 'main'} />
          </label>
          <label className="block">
            <div className="text-xs text-text-muted mb-1">Head</div>
            <input list="branches" className="bg-bg border border-bg-line rounded px-2 py-1.5 w-full text-sm font-mono"
                   value={headRef} onChange={(e) => setHeadRef(e.target.value)} />
          </label>
          <button className="bg-accent text-bg font-semibold rounded px-3 py-2 text-sm disabled:opacity-50" disabled={busy || !headRef}>
            Generate review
          </button>
          <datalist id="branches">
            {branches?.branches?.map((b) => <option key={b} value={b} />)}
          </datalist>
        </form>
        {err && <div className="mt-2 text-accent-red text-sm">{err}</div>}
      </div>

      <h2 className="font-semibold mb-2">Recent reviews</h2>
      {reviews.length === 0 && <div className="text-text-muted text-sm">No reviews yet.</div>}
      <ul className="space-y-2">
        {reviews.map((r) => (
          <li key={r.id} className="bg-bg-soft border border-bg-line rounded p-3 flex items-center gap-3">
            <Link to={`/reviews/${r.id}`} className="flex-1 font-mono text-sm">
              <span className="text-accent">{r.head_ref}</span>
              <span className="text-text-muted"> vs </span>
              <span className="text-accent-purple">{r.base_ref}</span>
              <span className="text-text-dim text-xs ml-2">{r.head_sha?.slice(0,7)}…{r.base_sha?.slice(0,7)}</span>
            </Link>
            <span className="text-xs text-text-dim">{r.created_at}</span>
            <button onClick={async () => { await api.reviews.delete(r.id); loadReviews(); }}
                    className="text-xs text-text-muted hover:text-accent-red">delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
