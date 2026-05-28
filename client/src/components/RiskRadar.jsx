import React, { useState } from 'react';

export default function RiskRadar({ risk, onJump }) {
  if (!risk) return null;
  const files = risk.files || [];
  if (!files.length) return null;
  const max = Math.max(...files.map((f) => f.score)) || 1;
  const [showAlgo, setShowAlgo] = useState(false);

  return (
    <div className="bg-bg-soft border border-bg-line rounded p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Risk Radar <span className="text-text-muted font-normal">— suggested review order</span></h3>
        <span className="text-xs text-text-dim">{files.length} files scored</span>
      </div>
      <details className="mb-2 text-xs text-text-muted"
               open={showAlgo}
               onToggle={(e) => setShowAlgo(e.currentTarget.open)}>
        <summary className="cursor-pointer hover:text-text select-none">
          How is this calculated?
        </summary>
        <div className="mt-2 pl-2 border-l-2 border-bg-line space-y-1.5">
          <p>Each non-test file gets a weighted score in <span className="font-mono text-text">[0, 1]</span> blended from five signals:</p>
          <ul className="space-y-1">
            <li><span className="font-mono text-text">size</span> <span className="text-text-dim">(weight 0.25)</span> — lines added + deleted, normalized at 200.</li>
            <li><span className="font-mono text-text">churn</span> <span className="text-text-dim">(0.20)</span> — commits touching the file in the last 90 days, normalized at 30.</li>
            <li><span className="font-mono text-text">fan-in</span> <span className="text-text-dim">(0.20)</span> — rough cross-file references via <span className="font-mono">git grep</span> on the basename, normalized at 50.</li>
            <li><span className="font-mono text-text">no-test penalty</span> <span className="text-text-dim">(0.15)</span> — 0.5 if the change is non-trivial (&gt; 20 lines) and no test file in the diff mentions the basename or shares its directory.</li>
            <li><span className="font-mono text-text">agent agreement</span> <span className="text-text-dim">(0.20)</span> — how many distinct AI reviewers flagged the file, plus a small bump per finding.</li>
          </ul>
          <p>Buckets: <span className="risk-high px-1.5 rounded">high</span> ≥ 0.65, <span className="risk-medium px-1.5 rounded">med</span> ≥ 0.35, <span className="risk-low px-1.5 rounded">low</span> below. Files are listed in descending score order; tests are excluded from the ranking and only used as a presence signal for the no-test penalty.</p>
        </div>
      </details>
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
