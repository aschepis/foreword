import React from 'react';

/**
 * Slim banner shown in the running header when the worktree HEAD has moved
 * away from the review's stored sha.
 *
 *   ahead     ochre, linear advance — N new commits
 *   diverged  red, branch was rewritten — refresh is destructive of context
 */
export default function DriftBanner({ state, busy, onRefresh }) {
  if (!state || state.drift === 'none' || state.drift === 'unknown') return null;
  const diverged = state.drift === 'diverged';

  const cls = diverged
    ? 'border-accent-red/40 bg-[color:var(--tint-red)] text-accent-red'
    : 'border-accent-yellow/50 bg-[color:var(--tint-yellow)] text-accent-yellow';

  return (
    <div className={`flex items-center gap-3 border-t ${cls} px-4 py-2 text-xs`}>
      <span aria-hidden>{diverged ? '⚠' : '↺'}</span>
      <span className="flex-1 text-text">
        {diverged ? (
          <>
            <b>Branch was rewritten</b> since this review was created.{' '}
            Refreshing will move the review to{' '}
            <span className="font-mono">{state.current_head_sha?.slice(0, 7)}</span>{' '}
            and replace the diff.
          </>
        ) : (
          <>
            <b>{state.new_commits} new commit{state.new_commits === 1 ? '' : 's'}</b> on{' '}
            <span className="font-mono">{state.head_ref}</span> since this review was created.{' '}
            Refresh to include{' '}
            <span className="font-mono">{state.current_head_sha?.slice(0, 7)}</span>.
          </>
        )}
      </span>
      <button
        onClick={onRefresh}
        disabled={busy}
        className={`text-xs font-semibold rounded px-3 py-1 disabled:opacity-50 ${
          diverged
            ? 'bg-accent-red text-bg hover:brightness-110'
            : 'bg-accent-yellow text-bg hover:brightness-110'
        }`}
      >
        {busy ? 'Refreshing…' : 'Refresh diff'}
      </button>
    </div>
  );
}
