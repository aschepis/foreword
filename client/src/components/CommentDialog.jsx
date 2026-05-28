import React, { useState, useEffect, useRef } from 'react';

export default function CommentDialog({ anchor, onSubmit, onClose }) {
  const [body, setBody] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  if (!anchor) return null;

  function submit(e) {
    e?.preventDefault();
    if (!body.trim()) return;
    onSubmit(body.trim());
    setBody('');
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
          {anchor.file
            ? <>commenting on <span className="text-accent">{anchor.file}</span>{anchor.line ? `:${anchor.line}` : ''}</>
            : 'global comment'}
        </div>
        <textarea
          ref={ref}
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e); }}
          placeholder="Write a comment… (⌘↩ to submit)"
          className="w-full bg-bg border border-bg-line rounded p-2 font-mono text-sm"
        />
        <div className="flex justify-end gap-2 mt-2">
          <button type="button" onClick={onClose} className="text-sm text-text-muted hover:text-text px-3 py-1">Cancel</button>
          <button type="submit" className="bg-accent text-bg font-semibold rounded px-3 py-1 text-sm">Comment</button>
        </div>
      </form>
    </div>
  );
}
