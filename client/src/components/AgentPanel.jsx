import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import AgentRunInspector from './AgentRunInspector.jsx';

export default function AgentPanel({ reviewId, runs, findings, onRefresh }) {
  const [agents, setAgents] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [consensusOnly, setConsensusOnly] = useState(false);
  const [inspectRunId, setInspectRunId] = useState(null);
  const [lastError, setLastError] = useState(null);

  useEffect(() => {
    api.agents.list().then((all) => {
      /* Review panel only shows review-kind agents; fix agents live in FixPanel. */
      const a = all.filter((x) => x.kind !== 'fix');
      setAgents(a);
      setSelected(new Set(a.filter((x) => x.enabled).map((x) => x.id)));
    });
  }, []);

  const groupedByLine = new Map();
  (findings || []).forEach((f) => {
    const key = `${f.file}:${f.line}`;
    if (!groupedByLine.has(key)) groupedByLine.set(key, new Set());
    groupedByLine.get(key).add(f.agent_name);
  });

  const visible = (findings || []).filter((f) => {
    if (!consensusOnly) return true;
    const k = `${f.file}:${f.line}`;
    return (groupedByLine.get(k)?.size || 0) >= 2;
  });

  const unmapped = visible.filter((f) => !f.mapped);
  const mapped = visible.filter((f) => f.mapped);

  async function run() {
    if (!selected.size) return;
    setBusy(true); setLastError(null);
    try {
      const resp = await api.agents.start(reviewId, [...selected]).catch((e) => ({ error: e.message }));
      if (resp?.error) {
        setLastError(resp.error);
      } else if (resp?.results) {
        const failures = resp.results.filter((r) => !r.ok);
        if (failures.length) {
          setLastError(`${failures.length} agent run${failures.length === 1 ? '' : 's'} failed: ` +
            failures.map((f) => f.error).join('; '));
        }
      }
      /* Re-fetch agents list too — `selected` may contain stale config IDs */
      api.agents.list().then((all) => {
        const a = all.filter((x) => x.kind !== 'fix');
        setAgents(a);
        setSelected((cur) => new Set([...cur].filter((id) => a.some((x) => x.id === id))));
      });
      onRefresh?.();
    } finally { setBusy(false); }
  }

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  return (
    <div className="bg-bg-soft border border-bg-line rounded p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">AI Reviewers</h3>
        <label className="text-xs text-text-muted flex items-center gap-1">
          <input type="checkbox" checked={consensusOnly} onChange={(e) => setConsensusOnly(e.target.checked)} />
          consensus only (≥2 agents)
        </label>
      </div>
      {agents.length === 0 && (
        <div className="text-xs text-text-muted mb-2">No agents configured. <a href="/settings" className="text-accent">Configure one</a>.</div>
      )}
      <div className="flex flex-wrap gap-2 mb-2">
        {agents.map((a) => (
          <label key={a.id}
                 className={`text-xs px-2 py-1 rounded border cursor-pointer ${selected.has(a.id) ? 'border-accent text-accent' : 'border-bg-line text-text-muted'}`}>
            <input type="checkbox" className="hidden" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
            {a.name}
          </label>
        ))}
        <button
          onClick={run}
          disabled={busy || !selected.size}
          className="ml-auto text-xs bg-accent text-bg font-semibold rounded px-3 py-1 disabled:opacity-50"
        >{busy ? 'Running…' : `Run ${selected.size} agent${selected.size === 1 ? '' : 's'}`}</button>
      </div>

      {lastError && (
        <div className="mb-2 text-xs bg-accent-red/10 border border-accent-red/40 rounded p-2 flex items-start gap-2">
          <span className="text-accent-red">⚠</span>
          <div className="flex-1 text-text">{lastError}</div>
          <button onClick={() => setLastError(null)} className="text-text-muted hover:text-text">✕</button>
        </div>
      )}
      {runs && runs.length > 0 && (
        <details className="text-xs text-text-muted mb-2" open>
          <summary className="cursor-pointer">Run history ({runs.length})</summary>
          <ul className="mt-1 space-y-1 max-h-40 overflow-auto">
            {runs.map((r) => (
              <li key={r.id} className="font-mono flex items-center gap-2">
                <span className={r.status === 'success' ? 'text-accent-green' : r.status === 'failed' ? 'text-accent-red' : 'text-accent-yellow'}>●</span>
                <span className="text-text">{r.agent_name}</span>
                <span className="text-text-muted">{r.status}</span>
                <span className="text-text-dim">{r.finding_count}f</span>
                {r.duration_ms != null && <span className="text-text-dim">{(r.duration_ms / 1000).toFixed(1)}s</span>}
                {r.exit_code != null && <span className="text-text-dim">exit={r.exit_code}</span>}
                <span className="text-text-dim">{r.started_at}</span>
                <button
                  onClick={async () => {
                    setBusy(true); setLastError(null);
                    try {
                      const resp = await api.agents.start(reviewId, [r.agent_config_id])
                        .catch((e) => ({ error: e.message }));
                      if (resp?.error) setLastError(resp.error);
                      else if (resp?.anyFailed) {
                        const f = resp.results.find((x) => !x.ok);
                        setLastError(`Re-run failed: ${f?.error || 'unknown error'}`);
                      }
                      onRefresh?.();
                    } finally { setBusy(false); }
                  }}
                  disabled={busy}
                  title="Re-run this agent against the same review"
                  className="ml-auto text-accent hover:underline disabled:opacity-50"
                >↻ re-run</button>
                <button onClick={() => setInspectRunId(r.id)}
                        className="text-accent hover:underline">view I/O</button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {inspectRunId && (() => {
        const r = runs?.find((x) => x.id === inspectRunId);
        return (
          <AgentRunInspector
            runId={inspectRunId}
            onClose={() => setInspectRunId(null)}
            onRerun={() => onRefresh?.()}
            onMissing={() => onRefresh?.()}
            fallback={r ? {
              agentConfigId: r.agent_config_id,
              agentName: r.agent_name,
              onRerun: async () => {
                await api.agents.start(reviewId, [r.agent_config_id]).catch(() => {});
                onRefresh?.();
              },
            } : null}
          />
        );
      })()}

      {unmapped.length > 0 && (
        <details open className="text-xs">
          <summary className="cursor-pointer text-text-muted">
            Global findings (not pinned to a diff line) — {unmapped.length}
          </summary>
          <ul className="mt-2 space-y-2">
            {unmapped.map((f) => (
              <li key={f.id} className="bg-bg-softer border border-bg-line rounded p-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-1 rounded bg-bg-line text-accent-purple">{f.agent_name}</span>
                  <span className={`text-[10px] px-1 rounded ${
                    f.severity === 'error' ? 'risk-high' : f.severity === 'warn' ? 'risk-medium' : 'risk-low'
                  }`}>{f.severity}</span>
                  {f.file && <span className="font-mono text-text-muted">{f.file}{f.line ? `:${f.line}` : ''}</span>}
                </div>
                <div className="mt-1 text-text whitespace-pre-wrap">{f.message}</div>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="text-[11px] text-text-dim mt-2">
        {mapped.length} finding{mapped.length === 1 ? '' : 's'} pinned inline.
      </div>
    </div>
  );
}
