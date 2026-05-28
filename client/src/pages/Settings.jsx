import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const EMPTY = {
  name: '',
  command: '',
  prompt_template:
    'You are a code reviewer. Review the following unified diff and respond ONLY with a JSON array of findings. Each finding must have: {"file": "path/relative/to/repo", "line": <line number in NEW file or null>, "severity": "info|warn|error", "message": "..."}.\n\nDiff:\n{{diff}}',
  enabled: 1,
};

export default function Settings() {
  const [agents, setAgents] = useState([]);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [stats, setStats] = useState(null);
  const [adminBusy, setAdminBusy] = useState(false);

  async function load() {
    setAgents(await api.agents.list());
    try { setStats(await api.admin.stats()); } catch {}
  }
  useEffect(() => { load(); }, []);

  async function clearReviews() {
    const msg = `Delete ALL ${stats?.reviews ?? '?'} review(s), ${stats?.comments ?? '?'} comment(s), ` +
                `${stats?.agent_runs ?? '?'} agent run(s), and ${stats?.agent_findings ?? '?'} finding(s)?\n\n` +
                `Repos, worktrees, and agent configs will be kept.\n\nThis cannot be undone.`;
    if (!confirm(msg)) return;
    setAdminBusy(true);
    try { await api.admin.clearReviews(); await load(); }
    finally { setAdminBusy(false); }
  }

  async function clearAll() {
    const msg = `NUCLEAR: wipe EVERYTHING — repos, worktrees, reviews, comments, agent configs, ` +
                `agent runs, findings, and settings.\n\nType "DELETE EVERYTHING" to confirm.`;
    const answer = prompt(msg);
    if (answer !== 'DELETE EVERYTHING') return;
    setAdminBusy(true);
    try { await api.admin.clearAll(); await load(); alert('All data cleared.'); }
    finally { setAdminBusy(false); }
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (editing.id) await api.agents.update(editing.id, editing);
      else await api.agents.create(editing);
      setEditing(null);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function toggle(a) {
    await api.agents.update(a.id, { enabled: a.enabled ? 0 : 1 });
    load();
  }

  async function del(a) {
    if (!confirm(`Delete agent "${a.name}"?`)) return;
    await api.agents.delete(a.id);
    load();
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl mb-4">Settings — AI agents</h1>
      <p className="text-sm text-text-muted mb-4">
        Configure shell commands that review diffs. Your prompt template will receive the placeholders{' '}
        <code className="bg-bg-soft px-1 rounded">{'{{diff}}'}</code>,{' '}
        <code className="bg-bg-soft px-1 rounded">{'{{file_paths}}'}</code>,{' '}
        <code className="bg-bg-soft px-1 rounded">{'{{base}}'}</code>, and{' '}
        <code className="bg-bg-soft px-1 rounded">{'{{head}}'}</code> on stdin. Output should be a JSON array
        of findings (or contain one).
      </p>

      <ul className="space-y-2 mb-4">
        {agents.map((a) => (
          <li key={a.id} className="bg-bg-soft border border-bg-line rounded p-3">
            <div className="flex items-center gap-2">
              <button onClick={() => toggle(a)}
                      className={`text-xs px-2 py-0.5 rounded ${a.enabled ? 'bg-accent-green/20 text-accent-green' : 'bg-bg-line text-text-muted'}`}>
                {a.enabled ? 'enabled' : 'disabled'}
              </button>
              <div className="font-semibold">{a.name}</div>
              <div className="font-mono text-xs text-text-muted flex-1 truncate">{a.command}</div>
              <button onClick={() => setEditing(a)} className="text-xs text-accent hover:underline">edit</button>
              <button onClick={() => del(a)} className="text-xs text-accent-red hover:underline">delete</button>
            </div>
          </li>
        ))}
      </ul>

      <button onClick={() => setEditing(EMPTY)} className="bg-accent text-bg font-semibold rounded px-3 py-2 text-sm">
        + new agent
      </button>

      <div className="mt-10 border border-accent-red/40 rounded-lg p-4 bg-accent-red/5">
        <h2 className="font-semibold text-accent-red mb-2">Danger zone</h2>
        {stats && (
          <div className="text-xs text-text-muted font-mono mb-3">
            {stats.repos} repos · {stats.worktrees} worktrees · {stats.reviews} reviews ·{' '}
            {stats.comments} comments · {stats.agent_configs} agents · {stats.agent_runs} runs ·{' '}
            {stats.agent_findings} findings · {stats.file_reviewed} file-marks
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border border-bg-line rounded p-3 bg-bg-soft">
            <div className="font-semibold text-sm mb-1">Clear all reviews</div>
            <div className="text-xs text-text-muted mb-3">
              Deletes every review, comment, file-reviewed mark, agent run, and finding.
              Keeps your repos, worktrees, and configured agents.
            </div>
            <button
              onClick={clearReviews}
              disabled={adminBusy}
              className="text-sm bg-accent-yellow/20 text-accent-yellow rounded px-3 py-1.5 hover:bg-accent-yellow/30 disabled:opacity-50"
            >Clear reviews</button>
          </div>
          <div className="border border-accent-red/40 rounded p-3 bg-bg-soft">
            <div className="font-semibold text-sm mb-1 text-accent-red">Clean slate</div>
            <div className="text-xs text-text-muted mb-3">
              Wipes <b>everything</b> — including repos, agent configs, and settings.
              Use when you want to start from scratch.
            </div>
            <button
              onClick={clearAll}
              disabled={adminBusy}
              className="text-sm bg-accent-red/20 text-accent-red rounded px-3 py-1.5 hover:bg-accent-red/30 disabled:opacity-50"
            >Delete everything…</button>
          </div>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
             onClick={() => setEditing(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()}
                className="bg-bg-soft border border-bg-line rounded-lg p-4 w-full max-w-2xl space-y-3">
            <h2 className="font-semibold">{editing.id ? 'Edit agent' : 'New agent'}</h2>
            <label className="block">
              <div className="text-xs text-text-muted mb-1">Name</div>
              <input className="w-full bg-bg border border-bg-line rounded px-2 py-1.5 text-sm"
                     value={editing.name} onChange={(e) => setEditing({...editing, name: e.target.value})} />
            </label>
            <label className="block">
              <div className="text-xs text-text-muted mb-1">Shell command — receives prompt on stdin</div>
              <input className="w-full bg-bg border border-bg-line rounded px-2 py-1.5 text-sm font-mono"
                     placeholder="e.g. claude -p --output-format text"
                     value={editing.command} onChange={(e) => setEditing({...editing, command: e.target.value})} />
            </label>
            <label className="block">
              <div className="text-xs text-text-muted mb-1">Prompt template</div>
              <textarea rows={8}
                     className="w-full bg-bg border border-bg-line rounded px-2 py-1.5 text-sm font-mono"
                     value={editing.prompt_template}
                     onChange={(e) => setEditing({...editing, prompt_template: e.target.value})} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!editing.enabled}
                     onChange={(e) => setEditing({...editing, enabled: e.target.checked ? 1 : 0})} />
              Enabled
            </label>
            {err && <div className="text-accent-red text-sm">{err}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="text-text-muted text-sm px-3 py-1">cancel</button>
              <button type="submit" disabled={busy} className="bg-accent text-bg font-semibold rounded px-3 py-1 text-sm">
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
