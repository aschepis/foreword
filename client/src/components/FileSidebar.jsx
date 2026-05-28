import React from 'react';

export default function FileSidebar({ files, reviewed, fileShas, onJump, onToggleReviewed, riskByPath }) {
  return (
    <aside className="bg-bg-soft border-r border-bg-line w-64 shrink-0 overflow-y-auto">
      <div className="px-3 py-2 border-b border-bg-line text-xs text-text-muted uppercase tracking-wider">
        Files ({files.length})
      </div>
      <ul className="text-sm">
        {files.map((f) => {
          const r = reviewed?.get(f.path);
          const stale = r && fileShas?.[f.path] && r.reviewed_sha !== fileShas[f.path];
          const isDone = r && !stale;
          const risk = riskByPath?.get(f.path);
          return (
            <li key={f.path} className="flex items-center gap-2 px-3 py-1 hover:bg-bg-softer">
              <input
                type="checkbox"
                checked={!!isDone}
                onChange={() => onToggleReviewed(f.path, fileShas?.[f.path], !!isDone)}
                title={stale ? 'changed since last review — re-mark' : isDone ? 'reviewed' : 'mark reviewed'}
              />
              <button onClick={() => onJump(f.path)} className="flex-1 text-left truncate font-mono text-xs"
                      title={f.path}>
                {risk && (
                  <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${
                    risk.level === 'high' ? 'bg-accent-red' :
                    risk.level === 'medium' ? 'bg-accent-yellow' : 'bg-accent-green'
                  }`} />
                )}
                <span className={isDone ? 'line-through text-text-dim' : stale ? 'text-accent-yellow' : 'text-text'}>
                  {f.path}
                </span>
              </button>
              <span className="text-[10px] text-accent-green">+{f.additions}</span>
              <span className="text-[10px] text-accent-red">-{f.deletions}</span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
