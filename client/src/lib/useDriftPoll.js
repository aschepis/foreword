import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

/**
 * Watches the worktree HEAD for drift away from the review's stored sha.
 *
 *   - polls every `intervalMs` (default 30s)
 *   - also polls immediately when the browser tab regains focus
 *   - pauses while the tab is hidden (saves a request loop the user can't see anyway)
 *
 * Returns { state, refresh } where state is the latest head-state payload
 * and refresh() forces an immediate poll.
 */
export function useDriftPoll(reviewId, { intervalMs = 30_000, enabled = true } = {}) {
  const [state, setState] = useState(null);

  const fetchOnce = useCallback(async () => {
    if (!reviewId || !enabled) return;
    try {
      const s = await api.reviews.headState(reviewId);
      setState(s);
    } catch {
      /* network blip — keep previous state */
    }
  }, [reviewId, enabled]);

  useEffect(() => {
    if (!reviewId || !enabled) return;
    let timer;
    let cancelled = false;

    function schedule() {
      if (cancelled) return;
      timer = setTimeout(async () => {
        if (document.visibilityState === 'visible') await fetchOnce();
        schedule();
      }, intervalMs);
    }

    /* Immediate first read, then begin polling */
    fetchOnce();
    schedule();

    function onVisibility() {
      if (document.visibilityState === 'visible') fetchOnce();
    }
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, [reviewId, enabled, intervalMs, fetchOnce]);

  return { state, refresh: fetchOnce };
}
