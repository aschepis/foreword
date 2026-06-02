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
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-4">
        <Link to="/" className="lr-eyebrow text-text-muted hover:text-text">← The Desk</Link>
      </div>

      {/* ─── Repo identity ──────────────────────────────────────────── */}
      <div className="lr-eyebrow mb-1">Repository</div>
      <h1 className="lr-serif text-[34px] font-semibold leading-tight tracking-tight">{repo.name}</h1>
      <div className="text-xs text-text-muted font-mono mt-1 mb-7">{repo.path}</div>

      {/* ─── Start a review ─────────────────────────────────────────── */}
      <section className="lr-paper p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="lr-eyebrow">Begin</div>
            <h2 className="lr-serif text-[20px] font-semibold leading-tight">Start a review</h2>
          </div>
          <button onClick={refresh} className="lr-eyebrow text-text-muted hover:text-text">↻ refresh worktrees</button>
        </div>
        <form onSubmit={startReview} className="space-y-3">
          <label className="block">
            <div className="lr-eyebrow text-text-dim mb-1">Worktree</div>
            <select className="w-full text-sm font-mono"
                    value={worktree} onChange={(e) => setWorktree(e.target.value)}>
              {repo.worktrees?.map((w) => (
                <option key={w.path} value={w.path}>
                  {w.path === repo.path ? '(main) ' : ''}{w.path}{w.branch ? ` — ${w.branch}` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <label className="block">
              <div className="lr-eyebrow text-text-dim mb-1">Base</div>
              <input list="branches" className="w-full text-sm font-mono"
                     value={baseRef} onChange={(e) => setBaseRef(e.target.value)} placeholder={repo.default_branch || 'main'} />
            </label>
            <label className="block">
              <div className="lr-eyebrow text-text-dim mb-1">Head</div>
              <input list="branches" className="w-full text-sm font-mono"
                     value={headRef} onChange={(e) => setHeadRef(e.target.value)} />
            </label>
            <button className="bg-accent text-bg font-semibold rounded px-4 py-2 text-sm h-fit disabled:opacity-50" disabled={busy || !headRef}>
              Generate review
            </button>
          </div>
          <datalist id="branches">
            {branches?.branches?.map((b) => <option key={b} value={b} />)}
          </datalist>
        </form>
        {err && <div className="mt-3 text-accent-red text-sm">{err}</div>}
      </section>

      {/* ─── Recent reviews ─────────────────────────────────────────── */}
      <div className="lr-eyebrow mb-3">Recent drafts</div>
      {reviews.length === 0 ? (
        <div className="lr-paper p-6 max-w-prose">
          <p className="lr-serif italic text-[15px] text-text lr-dropcap">
            No drafts in progress. Pick a head branch above and a review will appear here.
          </p>
        </div>
      ) : (
        <ul className="lr-paper divide-y divide-bg-line">
          {reviews.map((r) => (
            <li key={r.id} className="px-4 py-3 flex items-center gap-3 hover:bg-bg-hover transition-colors">
              <Link to={`/reviews/${r.id}`} className="flex-1 font-mono text-sm hover:no-underline">
                <span className="text-accent font-semibold">{r.head_ref}</span>
                <span className="text-text-muted mx-2">←</span>
                <span className="text-accent-purple">{r.base_ref}</span>
                <span className="text-text-dim text-xs ml-3">{r.head_sha?.slice(0,7)}…{r.base_sha?.slice(0,7)}</span>
              </Link>
              <span className="text-xs text-text-dim font-mono">{r.created_at}</span>
              <button onClick={async () => { await api.reviews.delete(r.id); loadReviews(); }}
                      className="text-xs text-text-dim hover:text-accent-red">delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
