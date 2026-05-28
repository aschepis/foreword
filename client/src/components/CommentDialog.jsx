import React, { useState, useEffect, useRef } from 'react';

export default function CommentDialog({ anchor, onSubmit, onClose }) {
  const [body, setBody] = useState('');
  const [agentFixable, setAgentFixable] = useState(false);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  if (!anchor) return null;

  const isReply = !!anchor.parentComment;
  const heading = isReply
    ? `Replying to ${anchor.parentComment.author}${anchor.parentComment.source?.startsWith('agent:') ? ' (agent)' : ''}`
    : (anchor.file
        ? <>commenting on <span className="text-accent">{anchor.file}</span>{anchor.line ? `:${anchor.line}` : ''}</>
        : 'global comment');

  function submit(e) {
    e?.preventDefault();
    if (!body.trim()) return;
    onSubmit({ body: body.trim(), agent_fixable: agentFixable });
    setBody(''); setAgentFixable(false);
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-bg-soft border border-bg-line rounded-lg p-4 w-full max-w-lg m-4"
      >
        <div className="text-sm text-text-muted mb-2 font-mono">
          {heading}
        </div>
        {isReply && (
          <div className="text-xs bg-bg border border-bg-line rounded p-2 mb-2 max-h-32 overflow-auto whitespace-pre-wrap text-text-muted">
            <b className="text-text">{anchor.parentComment.author}:</b> {anchor.parentComment.body}
          </div>
        )}
        <textarea
          ref={ref}
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e); }}
          placeholder={isReply ? 'Reply… (⌘↩ to submit)' : 'Write a comment… (⌘↩ to submit)'}
          className="w-full bg-bg border border-bg-line rounded p-2 font-mono text-sm"
        />
        <label className="flex items-center gap-2 text-xs text-text-muted mt-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agentFixable}
            onChange={(e) => setAgentFixable(e.target.checked)}
          />
          <span>
            🔧 <b className="text-text">Agent-fixable</b> — flag this for the fix agent to address.
          </span>
        </label>
        <div className="flex justify-end gap-2 mt-2">
          <button type="button" onClick={onClose} className="text-sm text-text-muted hover:text-text px-3 py-1">Cancel</button>
          <button type="submit" className="bg-accent text-bg font-semibold rounded px-3 py-1 text-sm">
            {isReply ? 'Reply' : 'Comment'}
          </button>
        </div>
      </form>
    </div>
  );
}
