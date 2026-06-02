import React from 'react';

export default function FileSidebar({ files, reviewed, fileShas, onJump, onToggleReviewed, riskByPath }) {
  return (
    <aside className="bg-bg-soft border-r border-bg-line w-64 shrink-0 overflow-y-auto">
      <div className="px-4 pt-3 pb-2 border-b border-bg-line">
        <div className="lr-eyebrow text-text-dim">Files · {files.length}</div>
      </div>
      <ul className="py-1">
        {files.map((f) => {
          const r = reviewed?.get(f.path);
          const stale = r && fileShas?.[f.path] && r.reviewed_sha !== fileShas[f.path];
          const isDone = r && !stale;
          const risk = riskByPath?.get(f.path);
          return (
            <li key={f.path}
                className="flex items-center gap-2 px-3 py-1 hover:bg-bg-hover transition-colors">
              <input
                type="checkbox"
                checked={!!isDone}
                onChange={() => onToggleReviewed(f.path, fileShas?.[f.path], !!isDone)}
                title={stale ? 'changed since last review — re-mark' : isDone ? 'reviewed' : 'mark reviewed'}
                className="shrink-0"
              />
              <button onClick={() => onJump(f.path)}
                      className="flex-1 text-left truncate font-mono text-[11px] hover:no-underline"
                      title={f.path}>
                {risk && (
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
                    style={{
                      background: risk.level === 'high' ? 'var(--accent-red)' :
                                 risk.level === 'medium' ? 'var(--accent-yellow)' :
                                 'var(--accent-green)',
                    }}
                  />
                )}
                <span className={
                  isDone ? 'line-through text-text-dim'
                  : stale ? 'text-accent-yellow'
                  : 'text-text'
                }>{f.path}</span>
              </button>
              <span className="text-[10px] text-accent-green font-mono tabular-nums">+{f.additions}</span>
              <span className="text-[10px] text-accent-red font-mono tabular-nums">−{f.deletions}</span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
