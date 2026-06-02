import React from 'react';

export default function TimeTravel({ commits, index, mode, onIndex, onMode, onReset }) {
  if (!commits || !commits.length) return null;
  const current = index >= 0 ? commits[index] : null;

  return (
    <div className="lr-paper p-4 mb-4">
      <div className="flex items-baseline justify-between mb-1">
        <div>
          <div className="lr-eyebrow">History</div>
          <h3 className="lr-serif text-[18px] font-semibold leading-tight">Time Travel</h3>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1 text-text-muted cursor-pointer">
            <input
              type="radio"
              checked={mode === 'cumulative'}
              onChange={() => onMode('cumulative')}
            /> cumulative
          </label>
          <label className="flex items-center gap-1 text-text-muted cursor-pointer">
            <input
              type="radio"
              checked={mode === 'single'}
              onChange={() => onMode('single')}
            /> per-commit
          </label>
          {index >= 0 && (
            <button onClick={onReset} className="text-accent hover:underline ml-1">
              show full diff
            </button>
          )}
        </div>
      </div>
      <p className="lr-serif italic text-[13px] text-text-muted mb-3">Scrub through the branch commit by commit.</p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onIndex(Math.max(-1, index - 1))}
          className="text-text-muted hover:text-accent text-base"
          title="prev (,)"
        >◀</button>
        <input
          type="range"
          min={-1}
          max={commits.length - 1}
          value={index}
          onChange={(e) => onIndex(parseInt(e.target.value, 10))}
          className="flex-1"
        />
        <button
          onClick={() => onIndex(Math.min(commits.length - 1, index + 1))}
          className="text-text-muted hover:text-accent text-base"
          title="next (.)"
        >▶</button>
        <span className="text-xs text-text-dim w-24 text-right font-mono tabular-nums">
          {index < 0 ? 'full diff' : `${index + 1} / ${commits.length}`}
        </span>
      </div>
      {current && (
        <div className="mt-3 pt-3 border-t border-bg-line text-xs">
          <span className="font-mono text-accent font-semibold">{current.short}</span>
          <span className="font-mono ml-2 text-text">{current.subject}</span>
          <span className="text-text-dim ml-2">— {current.author}</span>
        </div>
      )}
    </div>
  );
}
