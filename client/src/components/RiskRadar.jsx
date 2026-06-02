import React, { useState } from 'react';

export default function RiskRadar({ risk, onJump }) {
  const [showAlgo, setShowAlgo] = useState(false);
  if (!risk) return null;
  const files = risk.files || [];
  if (!files.length) return null;
  const max = Math.max(...files.map((f) => f.score)) || 1;

  return (
    <div className="lr-paper p-4 mb-4">
      <div className="flex items-baseline justify-between mb-1">
        <div>
          <div className="lr-eyebrow">Triage</div>
          <h3 className="lr-serif text-[18px] font-semibold leading-tight">Risk Radar</h3>
        </div>
        <span className="text-xs text-text-dim">{files.length} files scored</span>
      </div>
      <p className="lr-serif italic text-[13px] text-text-muted mb-3">Suggested reading order — most risky on top.</p>

      <details className="mb-3 text-xs text-text-muted"
               open={showAlgo}
               onToggle={(e) => setShowAlgo(e.currentTarget.open)}>
        <summary className="cursor-pointer hover:text-text select-none lr-eyebrow">
          How is this calculated?
        </summary>
        <div className="mt-2 pl-3 border-l-2 border-bg-line space-y-1.5 text-text-muted">
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

      <ul className="space-y-0.5">
        {files.map((f) => (
          <li key={f.path}>
            <button
              onClick={() => onJump?.(f.path)}
              className="w-full text-left flex items-center gap-2 hover:bg-bg-hover rounded px-2 py-1.5 transition-colors"
              title={`size ${f.size} • churn ${f.churn} • fan-in ${f.fanIn} • agents ${f.agentCount}`}
            >
              <span className={`text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded risk-${f.level} shrink-0 w-[44px] text-center`}>
                {f.level}
              </span>
              <span className="font-mono text-xs flex-1 truncate text-text">{f.path}</span>
              <span className="text-xs text-accent-green font-mono tabular-nums">+{f.additions}</span>
              <span className="text-xs text-accent-red font-mono tabular-nums">−{f.deletions}</span>
              {f.agentCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded lr-meta-badge-agent">
                  ✥ {f.agentCount}
                </span>
              )}
              {!f.hasTestCompanion && f.size > 20 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded lr-meta-badge-stale" title="no companion test changes">no tests</span>
              )}
              <div className="w-20 h-[3px] bg-bg-line rounded overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.round((f.score / max) * 100)}%`,
                    background: f.level === 'high' ? 'var(--accent-red)' : f.level === 'medium' ? 'var(--accent-yellow)' : 'var(--accent-green)',
                  }}
                />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
