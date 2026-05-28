import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function AgentRunInspector({ runId, onClose, onMissing, fallback, onRerun }) {
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('prompt');
  const [rerunning, setRerunning] = useState(false);

  async function doRerun() {
    setRerunning(true);
    try { await api.agents.rerun(runId); onRerun?.(); onClose(); }
    catch (e) { setErr(e.message); }
    finally { setRerunning(false); }
  }

  useEffect(() => {
    setDetail(null); setErr(null);
    api.agents.runDetail(runId).then(setDetail).catch((e) => {
      setErr(e.message);
      if (/not found/i.test(e.message)) onMissing?.(runId);
    });
  }, [runId]);

  if (err && /not found/i.test(err)) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div className="bg-bg-soft border border-bg-line rounded-lg p-6 max-w-md text-center" onClick={(e) => e.stopPropagation()}>
          <div className="text-accent-yellow text-2xl mb-2">⚠</div>
          <h2 className="font-semibold mb-2">Run #{runId} no longer exists</h2>
          <p className="text-sm text-text-muted mb-4">
            This agent run was deleted. {fallback?.agentConfigId
              ? <>You can re-run <b>{fallback.agentName || `agent #${fallback.agentConfigId}`}</b> against this review.</>
              : 'The run history has been refreshed.'}
          </p>
          <div className="flex gap-2 justify-center">
            <button onClick={onClose} className="text-text-muted hover:text-text px-4 py-1.5 text-sm">Close</button>
            {fallback?.agentConfigId && (
              <button
                onClick={async () => {
                  await fallback.onRerun();
                  onClose();
                }}
                className="bg-accent text-bg font-semibold rounded px-4 py-1.5 text-sm"
              >↻ Re-run agent</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  function copy(text) {
    navigator.clipboard?.writeText(text || '').catch(() => {});
  }

  function download(name, text) {
    const blob = new Blob([text || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-bg-soft border border-bg-line rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-bg-line">
          <h2 className="font-semibold">Agent run #{runId}</h2>
          {detail?.run && (
            <>
              <span className={`text-xs px-2 py-0.5 rounded ${
                detail.run.status === 'success' ? 'bg-accent-green/20 text-accent-green' :
                detail.run.status === 'failed' ? 'bg-accent-red/20 text-accent-red' :
                'bg-accent-yellow/20 text-accent-yellow'
              }`}>{detail.run.status}</span>
              <span className="text-xs text-text-muted">{detail.run.agent_name}</span>
              <span className="text-xs text-text-dim">exit {detail.run.exit_code ?? '—'}</span>
              {detail.run.duration_ms != null && (
                <span className="text-xs text-text-dim">{(detail.run.duration_ms / 1000).toFixed(2)}s</span>
              )}
              <span className="text-xs text-text-dim">{detail.run.finding_count} findings</span>
            </>
          )}
          <button
            onClick={doRerun}
            disabled={rerunning}
            title="Re-run this agent against the same review"
            className="ml-auto text-xs bg-accent/15 text-accent hover:bg-accent/25 rounded px-2 py-1 disabled:opacity-50"
          >{rerunning ? 'running…' : '↻ re-run'}</button>
          <button onClick={onClose} className="text-text-muted hover:text-text">✕</button>
        </div>

        {err && <div className="p-4 text-accent-red text-sm">{err}</div>}
        {!detail && !err && <div className="p-4 text-text-muted text-sm">Loading…</div>}

        {detail && (
          <>
            <div className="px-4 py-2 border-b border-bg-line text-xs text-text-muted font-mono">
              <span className="text-text-dim">command:</span> {detail.run.command || <i className="text-text-dim">(unknown)</i>}
            </div>
            <div className="flex gap-1 border-b border-bg-line px-3">
              {[
                ['prompt', 'Prompt (stdin)', detail.run.prompt],
                ['stdout', 'stdout', detail.run.stdout],
                ['stderr', 'stderr', detail.run.stderr],
                ['findings', `Parsed findings (${detail.findings.length})`, null],
              ].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`px-3 py-2 text-xs ${tab === id ? 'border-b-2 border-accent text-text' : 'text-text-muted hover:text-text'}`}
                >{label}</button>
              ))}
            </div>

            <div className="flex-1 overflow-auto p-0">
              {tab === 'findings' ? (
                <FindingsTable findings={detail.findings} />
              ) : (
                <RawPane
                  text={tab === 'prompt' ? detail.run.prompt
                       : tab === 'stdout' ? detail.run.stdout
                       : detail.run.stderr}
                  onCopy={(t) => copy(t)}
                  onDownload={(t) => download(`run-${runId}-${tab}.txt`, t)}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RawPane({ text, onCopy, onDownload }) {
  if (!text) return <div className="p-6 text-text-muted text-sm italic">empty</div>;
  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 px-4 py-2 border-b border-bg-line text-xs">
        <span className="text-text-dim">{text.length.toLocaleString()} chars</span>
        <button onClick={() => onCopy(text)} className="text-accent hover:underline ml-auto">copy</button>
        <button onClick={() => onDownload(text)} className="text-accent hover:underline">download</button>
      </div>
      <pre className="flex-1 overflow-auto p-4 m-0 text-xs font-mono whitespace-pre-wrap break-words bg-bg text-text">{text}</pre>
    </div>
  );
}

function FindingsTable({ findings }) {
  if (!findings.length) return <div className="p-6 text-text-muted text-sm italic">No findings parsed from output.</div>;
  return (
    <table className="w-full text-xs font-mono">
      <thead className="sticky top-0 bg-bg-softer">
        <tr className="text-left text-text-muted">
          <th className="px-3 py-2">Sev</th>
          <th className="px-3 py-2">File</th>
          <th className="px-3 py-2">Line</th>
          <th className="px-3 py-2">Mapped</th>
          <th className="px-3 py-2">Message</th>
        </tr>
      </thead>
      <tbody>
        {findings.map((f) => (
          <tr key={f.id} className="border-t border-bg-line align-top">
            <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded ${
              f.severity === 'error' ? 'risk-high' : f.severity === 'warn' ? 'risk-medium' : 'risk-low'
            }`}>{f.severity}</span></td>
            <td className="px-3 py-2 text-accent">{f.file || '—'}</td>
            <td className="px-3 py-2 text-text-muted">{f.line ?? '—'}</td>
            <td className="px-3 py-2">{f.mapped ? <span className="text-accent-green">✓ inline</span> : <span className="text-text-dim">global</span>}</td>
            <td className="px-3 py-2 whitespace-pre-wrap break-words text-text font-sans">{f.message}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
