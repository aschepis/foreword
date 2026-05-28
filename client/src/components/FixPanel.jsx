import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function FixPanel({ reviewId, comments, onAfterRun, onReloadDiff }) {
  const [fixAgents, setFixAgents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [completed, setCompleted] = useState(null);

  useEffect(() => {
    api.agents.list().then((all) => {
      const fix = all.filter((a) => a.kind === 'fix' && a.enabled);
      setFixAgents(fix);
      setSelectedId((cur) => cur || fix[0]?.id || null);
    });
  }, []);

  const fixableComments = comments.filter((c) =>
    c.agent_fixable && (c.fix_status == null || c.fix_status === 'failed' || c.fix_status === 'skipped')
  );

  async function run() {
    if (!selectedId || !fixableComments.length) return;
    setRunning(true); setProgress({ index: -1, total: fixableComments.length, events: [] });
    setError(null); setCompleted(null);

    try {
      await api.fix.run(reviewId, selectedId, (evt) => {
        setProgress((cur) => {
          const next = { ...cur };
          if (evt.type === 'start') {
            next.total = evt.total;
            next.events = [];
          } else if (evt.type === 'comment-start') {
            next.index = evt.index;
            next.events = [...next.events, evt];
          } else if (evt.type === 'comment-done') {
            next.events = next.events.map((e) =>
              e.comment_id === evt.comment_id && e.type === 'comment-start'
                ? { ...e, ...evt, type: 'comment-done' }
                : e
            );
          } else if (evt.type === 'done') {
            next.summary = evt;
          } else if (evt.type === 'error') {
            setError(evt.error);
          }
          return next;
        });
      });
      /* Stream closed — finalize */
      setRunning(false);
      onAfterRun?.();
    } catch (e) {
      setRunning(false);
      setError(e.message);
    }
  }

  function closeCompleted() {
    setCompleted(null);
    setProgress(null);
  }

  /* When run finishes with commits made, prompt for reload */
  useEffect(() => {
    if (running) return;
    if (!progress?.summary) return;
    if (progress.summary.commits_made > 0) {
      setCompleted(progress.summary);
    }
  }, [running, progress?.summary]);

  if (fixAgents.length === 0) {
    if (fixableComments.length === 0) return null;
    return (
      <div className="bg-bg-soft border border-bg-line rounded p-3 mb-3 text-xs text-text-muted">
        <b className="text-text">{fixableComments.length}</b> comment{fixableComments.length === 1 ? '' : 's'} flagged for the fix agent, but no fix agent is configured.{' '}
        <a href="/settings" className="text-accent hover:underline">Configure one in Settings →</a>
      </div>
    );
  }

  return (
    <div className="bg-bg-soft border border-bg-line rounded p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">🔧 Fix mode</h3>
        <span className="text-xs text-text-muted">
          <b className="text-accent-yellow">{fixableComments.length}</b> pending fix{fixableComments.length === 1 ? '' : 'es'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="bg-bg border border-bg-line rounded px-2 py-1 text-xs"
          value={selectedId || ''}
          onChange={(e) => setSelectedId(parseInt(e.target.value, 10))}
        >
          {fixAgents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <button
          onClick={run}
          disabled={running || !fixableComments.length}
          className="text-xs bg-accent-yellow/20 text-accent-yellow rounded px-3 py-1 hover:bg-accent-yellow/30 disabled:opacity-50 font-semibold"
        >
          {running ? `Running… (${(progress?.index ?? -1) + 1}/${progress?.total || fixableComments.length})` :
           `Run fix agent on ${fixableComments.length} comment${fixableComments.length === 1 ? '' : 's'}`}
        </button>
      </div>

      {error && (
        <div className="mt-2 text-xs bg-accent-red/10 border border-accent-red/40 rounded p-2 text-text">
          <b className="text-accent-red">⚠ {error}</b>
        </div>
      )}

      {progress?.events?.length > 0 && (
        <ul className="mt-3 space-y-1 max-h-48 overflow-auto text-xs font-mono">
          {progress.events.map((e, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className={
                e.type === 'comment-done' ? (
                  e.status === 'fixed' ? 'text-accent-green' :
                  e.status === 'skipped' ? 'text-text-muted' :
                  'text-accent-red'
                ) : 'text-accent-yellow'
              }>
                {e.type === 'comment-done' ?
                  (e.status === 'fixed' ? '✓' : e.status === 'skipped' ? '·' : '✗') :
                  '◌'}
              </span>
              <span className="text-text-muted">
                comment #{e.comment_id}{e.file ? ` ${e.file}${e.line ? `:${e.line}` : ''}` : ''}
              </span>
              {e.type === 'comment-done' && (
                <>
                  <span className={
                    e.status === 'fixed' ? 'text-accent-green' :
                    e.status === 'skipped' ? 'text-text-muted' :
                    'text-accent-red'
                  }>{e.status}</span>
                  {e.commit_sha && <span className="text-text-dim">{e.commit_sha.slice(0, 7)}</span>}
                  {e.duration_ms != null && <span className="text-text-dim">{(e.duration_ms / 1000).toFixed(1)}s</span>}
                  {e.message && e.status !== 'fixed' && <span className="text-text-dim">— {e.message}</span>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {completed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
             onClick={closeCompleted}>
          <div className="bg-bg-soft border border-bg-line rounded-lg p-6 max-w-md text-center"
               onClick={(e) => e.stopPropagation()}>
            <div className="text-accent-green text-3xl mb-2">✓</div>
            <h2 className="font-semibold mb-1">Fix agent finished</h2>
            <p className="text-sm text-text-muted mb-4">
              Made <b className="text-text">{completed.commits_made}</b> commit{completed.commits_made === 1 ? '' : 's'} addressing{' '}
              {completed.results.filter((r) => r.status === 'fixed').length}/{completed.total} comment{completed.total === 1 ? '' : 's'}.
              Reload the diff to see the changes?
            </p>
            <div className="flex gap-2 justify-center">
              <button onClick={closeCompleted} className="text-text-muted hover:text-text px-4 py-1.5 text-sm">
                Not now
              </button>
              <button
                onClick={() => { onReloadDiff?.(); closeCompleted(); }}
                className="bg-accent text-bg font-semibold rounded px-4 py-1.5 text-sm"
              >Reload diff</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
