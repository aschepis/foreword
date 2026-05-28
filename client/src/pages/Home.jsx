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
    if (!confirm('Remove this repo from local-review? (does not delete files)')) return;
    await api.repos.delete(id);
    load();
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-xl mb-3">Your repositories</h1>
      <form onSubmit={addRepo} className="flex gap-2 mb-6">
        <input
          className="flex-1 bg-bg-soft border border-bg-line rounded px-3 py-2 text-text font-mono text-sm"
          placeholder="/absolute/path/to/repo"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
        <button
          className="bg-accent text-bg font-semibold rounded px-4 py-2 disabled:opacity-50"
          disabled={busy || !path.trim()}
        >Add repo</button>
      </form>
      {err && <div className="mb-3 text-accent-red text-sm">{err}</div>}
      {repos.length === 0 && (
        <div className="text-text-muted text-sm border border-dashed border-bg-line rounded p-6 text-center">
          No repositories yet. Add an absolute path to a git repo to get started.
        </div>
      )}
      <ul className="space-y-2">
        {repos.map((r) => (
          <li key={r.id} className="bg-bg-soft border border-bg-line rounded p-3 flex items-center gap-3">
            <Link to={`/repos/${r.id}`} className="flex-1">
              <div className="font-semibold text-text">{r.name}</div>
              <div className="text-xs text-text-muted font-mono">{r.path}</div>
            </Link>
            <span className="text-xs text-text-dim">{r.default_branch}</span>
            <button onClick={() => del(r.id)} className="text-xs text-text-muted hover:text-accent-red">remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
