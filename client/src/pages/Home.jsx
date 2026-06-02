import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function Home() {
  const [repos, setRepos] = useState([]);
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const nav = useNavigate();

  async function load() {
    setRepos(await api.repos.list());
  }
  useEffect(() => { load(); }, []);

  async function addRepo(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const repo = await api.repos.add(path);
      setPath('');
      await load();
      nav(`/repos/${repo.id}`);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function del(id) {
    if (!confirm('Remove this repo from Foreword? (does not delete files)')) return;
    await api.repos.delete(id);
    load();
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      {/* ─── Hero ───────────────────────────────────────────────────── */}
      <div className="mb-10">
        <div className="lr-eyebrow mb-2">The Desk</div>
        <h1 className="lr-serif text-[44px] leading-[1.05] font-semibold tracking-tight">
          Your repositories.
        </h1>
        <p className="lr-serif text-[17px] italic text-text-muted mt-3 max-w-prose">
          Bring a git repo to the desk. Pick a branch. Read what was written, with help from your editorial board, before sending it out.
        </p>
      </div>

      {/* ─── Add repo ───────────────────────────────────────────────── */}
      <form onSubmit={addRepo} className="lr-paper p-4 mb-6">
        <label className="block">
          <div className="lr-eyebrow mb-2">Add a repository</div>
          <div className="flex gap-2">
            <input
              className="flex-1 font-mono text-sm"
              placeholder="/absolute/path/to/repo"
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
            <button
              className="bg-accent text-bg font-semibold rounded px-4 py-1.5 text-sm disabled:opacity-50"
              disabled={busy || !path.trim()}
            >Add</button>
          </div>
        </label>
        {err && <div className="mt-2 text-accent-red text-sm">{err}</div>}
      </form>

      {/* ─── List or empty state ────────────────────────────────────── */}
      {repos.length === 0 ? (
        <div className="lr-paper p-8 max-w-prose">
          <p className="lr-serif italic text-[16px] leading-relaxed text-text lr-dropcap">
            Nothing on the desk yet. Add a repository above to begin.
          </p>
        </div>
      ) : (
        <>
          <div className="lr-eyebrow mb-3">Catalogue</div>
          <ul className="space-y-3">
            {repos.map((r) => (
              <li key={r.id} className="lr-paper p-4 flex items-center gap-3 hover:bg-bg-hover transition-colors">
                <Link to={`/repos/${r.id}`} className="flex-1 hover:no-underline">
                  <div className="lr-serif text-[18px] font-semibold text-text leading-tight">{r.name}</div>
                  <div className="text-xs text-text-muted font-mono mt-0.5">{r.path}</div>
                </Link>
                <div className="lr-eyebrow shrink-0">{r.default_branch}</div>
                <button onClick={() => del(r.id)} className="text-xs text-text-dim hover:text-accent-red">remove</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
