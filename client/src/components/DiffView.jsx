import React, { Fragment, useMemo, useState } from 'react';
import {
  parseDiff,
  Diff,
  Hunk,
  Decoration,
  tokenize,
  getChangeKey,
  markEdits,
} from 'react-diff-view';
import { refractor } from 'refractor/all';

const EXT_LANG = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript',
  py: 'python', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', scala: 'scala',
  rb: 'ruby', php: 'php', c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cs: 'csharp',
  swift: 'swift', m: 'objectivec', mm: 'objectivec',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  md: 'markdown', mdx: 'markdown',
  json: 'json', yml: 'yaml', yaml: 'yaml', toml: 'toml', xml: 'xml',
  html: 'html', htm: 'html', vue: 'html', svelte: 'html',
  css: 'css', scss: 'scss', sass: 'sass', less: 'less',
  sql: 'sql', graphql: 'graphql', gql: 'graphql',
  dockerfile: 'docker', lua: 'lua', r: 'r', dart: 'dart', ex: 'elixir', exs: 'elixir',
  clj: 'clojure', erl: 'erlang', hs: 'haskell',
};

function langFor(filePath) {
  if (!filePath) return null;
  const base = filePath.split('/').pop().toLowerCase();
  if (base === 'dockerfile') return 'docker';
  if (base === 'makefile') return 'makefile';
  const ext = base.split('.').pop();
  return EXT_LANG[ext] || null;
}

function fileAnchorId(path) {
  return 'lr-file-' + (path || '').replace(/[^a-zA-Z0-9]/g, '_');
}

export function fileIdFor(path) { return fileAnchorId(path); }

export default function DiffView({
  diff,
  commentsByLine,
  outputFormat = 'side-by-side',
  onAddComment,
  fileStatus,
}) {
  const files = useMemo(() => {
    if (!diff) return [];
    try {
      return parseDiff(diff, { nearbySequences: 'zip' });
    } catch (e) {
      console.error('parseDiff failed', e);
      return [];
    }
  }, [diff]);

  if (!diff) {
    return (
      <div className="empty-diff">No changes.</div>
    );
  }
  if (!files.length) {
    return (
      <div className="empty-diff">Diff parsed but produced no files.</div>
    );
  }

  return (
    <div className="diff-host">
      {files.map((file) => (
        <FileCard
          key={`${file.oldRevision}-${file.newRevision}-${file.newPath || file.oldPath}`}
          file={file}
          viewType={outputFormat === 'side-by-side' ? 'split' : 'unified'}
          comments={commentsByLine?.get(file.newPath || file.oldPath)}
          onAddComment={onAddComment}
          status={fileStatus?.get(file.newPath || file.oldPath)}
        />
      ))}
    </div>
  );
}

function FileCard({ file, viewType, comments, onAddComment, status }) {
  const path = file.newPath || file.oldPath;
  const oldPath = file.oldPath;
  const [collapsed, setCollapsed] = useState(false);

  const language = langFor(path);

  const tokens = useMemo(() => {
    if (!language) return null;
    try {
      return tokenize(file.hunks, {
        highlight: true,
        refractor,
        language,
        enhancers: [markEdits(file.hunks, { type: 'block' })],
      });
    } catch (e) {
      try {
        return tokenize(file.hunks, { highlight: true, refractor, language });
      } catch {
        return null;
      }
    }
  }, [file.hunks, language]);

  const widgets = useMemo(() => {
    const w = {};
    if (!comments) return w;
    for (const hunk of file.hunks) {
      for (const change of hunk.changes) {
        const ln = change.isNormal ? change.newLineNumber : (change.isInsert ? change.lineNumber : null);
        const lineKey = ln || (change.isInsert ? change.lineNumber : null);
        if (!lineKey) continue;
        const threads = comments.get(lineKey);
        if (!threads || !threads.length) continue;
        w[getChangeKey(change)] = <CommentWidget threads={threads} />;
      }
    }
    return w;
  }, [file.hunks, comments]);

  const gutterEvents = useMemo(() => ({
    onDoubleClick: ({ change, side }, ev) => {
      ev?.stopPropagation?.();
      const newLine = change.isInsert ? change.lineNumber
        : change.isNormal ? change.newLineNumber
        : null;
      const oldLine = change.isDelete ? change.lineNumber
        : change.isNormal ? change.oldLineNumber
        : null;
      const line = side === 'new' ? newLine : oldLine || newLine;
      if (!line) return;
      onAddComment?.({ file: path, line, side: side === 'new' ? 'right' : 'left' });
    },
  }), [path, onAddComment]);

  const additions = file.hunks.reduce((sum, h) => sum + h.changes.filter((c) => c.isInsert).length, 0);
  const deletions = file.hunks.reduce((sum, h) => sum + h.changes.filter((c) => c.isDelete).length, 0);

  return (
    <div className="lr-file-card" id={fileAnchorId(path)}>
      <div className="lr-file-header">
        <button className="lr-collapse-btn" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'expand' : 'collapse'}>
          {collapsed ? '▸' : '▾'}
        </button>
        <FileTypeBadge type={file.type} />
        <span className="lr-file-name" title={path}>{path}</span>
        {file.type === 'rename' && oldPath !== path && (
          <span className="lr-rename-from" title={`renamed from ${oldPath}`}>
            ← {oldPath}
          </span>
        )}
        {status && <ReviewStatusBadge status={status} />}
        <span className="lr-file-stats">
          <span className="lr-stat-add">+{additions}</span>
          <span className="lr-stat-del">−{deletions}</span>
        </span>
      </div>
      {!collapsed && (
        file.hunks.length === 0 ? (
          <div className="lr-empty-hunk">
            {file.type === 'rename' ? 'Renamed without content changes.' :
             file.type === 'delete' ? 'File deleted.' :
             file.type === 'add' ? 'Empty new file.' :
             'No textual changes (possibly binary).'}
          </div>
        ) : (
          <Diff
            viewType={viewType}
            diffType={file.type}
            hunks={file.hunks}
            widgets={widgets}
            tokens={tokens}
            gutterEvents={gutterEvents}
            className="lr-diff"
          >
            {(hunks) => hunks.flatMap((hunk, i) => [
              <Decoration key={`d-${i}`} className="lr-hunk-info">
                <span className="lr-hunk-pos">{`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`}</span>
                {hunk.content && <span className="lr-hunk-ctx">{hunk.content.replace(/^@@.*?@@\s*/, '')}</span>}
              </Decoration>,
              <Hunk key={`h-${i}`} hunk={hunk} />,
            ])}
          </Diff>
        )
      )}
    </div>
  );
}

function FileTypeBadge({ type }) {
  const map = {
    add: { label: 'NEW', cls: 'lr-badge-add' },
    delete: { label: 'DELETED', cls: 'lr-badge-del' },
    rename: { label: 'RENAMED', cls: 'lr-badge-rename' },
    copy: { label: 'COPIED', cls: 'lr-badge-rename' },
    modify: null,
  };
  const v = map[type];
  if (!v) return null;
  return <span className={`lr-badge ${v.cls}`}>{v.label}</span>;
}

function ReviewStatusBadge({ status }) {
  if (status === 'reviewed') return <span className="lr-badge lr-badge-reviewed">REVIEWED</span>;
  if (status === 'stale') return <span className="lr-badge lr-badge-stale">CHANGED SINCE REVIEW</span>;
  return null;
}

function CommentWidget({ threads }) {
  return (
    <div className="lr-thread-container">
      {threads.map((thread, i) => (
        <div key={thread[0]?.id || i} className="lr-thread">
          {thread.map((c) => <CommentItem key={c.id} c={c} />)}
        </div>
      ))}
    </div>
  );
}

function CommentItem({ c }) {
  const isAgent = c.source && c.source.startsWith('agent:');
  return (
    <div className={`lr-comment ${isAgent ? 'lr-comment-agent' : ''}`}>
      <div className="lr-comment-meta">
        {isAgent && <span className="lr-meta-badge lr-meta-badge-agent">{c.source.replace('agent:', '')}</span>}
        <b>{c.author}</b>
        <span className="lr-comment-date">· {c.created_at}</span>
        {c.resolved ? <span className="lr-comment-resolved">· resolved</span> : null}
      </div>
      <div className="lr-comment-body">{c.body}</div>
    </div>
  );
}
