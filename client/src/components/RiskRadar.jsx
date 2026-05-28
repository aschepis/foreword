import React from 'react';

export default function RiskRadar({ risk, onJump }) {
  if (!risk) return null;
  const files = risk.files || [];
  if (!files.length) return null;
  const max = Math.max(...files.map((f) => f.score)) || 1;

  return (
    <div className="bg-bg-soft border border-bg-line rounded p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Risk Radar <span className="text-text-muted font-normal">— suggested review order</span></h3>
        <span className="text-xs text-text-dim">{files.length} files scored</span>
      </div>
      <div className="space-y-1">
        {files.map((f) => (
          <button
            key={f.path}
            onClick={() => onJump?.(f.path)}
            className="w-full text-left flex items-center gap-2 hover:bg-bg-softer rounded px-2 py-1"
            title={`size ${f.size} • churn ${f.churn} • fan-in ${f.fanIn} • agents ${f.agentCount}`}
          >
            <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded risk-${f.level}`}>
              {f.level}
            </span>
            <span className="font-mono text-xs flex-1 truncate text-text">{f.path}</span>
            <span className="text-xs text-accent-green">+{f.additions}</span>
            <span className="text-xs text-accent-red">-{f.deletions}</span>
            {f.agentCount > 0 && (
              <span className="text-[10px] px-1 rounded bg-bg-line text-accent-purple">
                🤖 {f.agentCount}
              </span>
            )}
            {!f.hasTestCompanion && f.size > 20 && (
              <span className="text-[10px] px-1 rounded bg-bg-line text-accent-yellow" title="no companion test changes">no tests</span>
            )}
            <div className="w-20 h-1.5 bg-bg-line rounded overflow-hidden">
              <div
                className={`h-full ${f.level === 'high' ? 'bg-accent-red' : f.level === 'medium' ? 'bg-accent-yellow' : 'bg-accent-green'}`}
                style={{ width: `${Math.round((f.score / max) * 100)}%` }}
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
