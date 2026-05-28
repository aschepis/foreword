import React from 'react';

export default function TimeTravel({ commits, index, mode, onIndex, onMode, onReset }) {
  if (!commits || !commits.length) return null;
  const current = index >= 0 ? commits[index] : null;

  return (
    <div className="bg-bg-soft border border-bg-line rounded p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">
          Time Travel <span className="text-text-muted font-normal">— scrub through commits</span>
        </h3>
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1 text-text-muted">
            <input
              type="radio"
              checked={mode === 'cumulative'}
              onChange={() => onMode('cumulative')}
            /> cumulative
          </label>
          <label className="flex items-center gap-1 text-text-muted">
            <input
              type="radio"
              checked={mode === 'single'}
              onChange={() => onMode('single')}
            /> per-commit
          </label>
          {index >= 0 && (
            <button onClick={onReset} className="text-text-muted hover:text-accent ml-2">
              show full diff
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onIndex(Math.max(-1, index - 1))}
          className="text-text-muted hover:text-accent text-sm"
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
          className="text-text-muted hover:text-accent text-sm"
          title="next (.)"
        >▶</button>
        <span className="text-xs text-text-dim w-24 text-right">
          {index < 0 ? 'full diff' : `${index + 1} / ${commits.length}`}
        </span>
      </div>
      {current && (
        <div className="mt-2 text-xs text-text-muted font-mono">
          <span className="text-accent">{current.short}</span> {current.subject}{' '}
          <span className="text-text-dim">— {current.author}</span>
        </div>
      )}
    </div>
  );
}
