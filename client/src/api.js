async function req(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  repos: {
    list: () => req('/api/repos'),
    add: (path) => req('/api/repos', { method: 'POST', body: { path } }),
    get: (id) => req(`/api/repos/${id}`),
    delete: (id) => req(`/api/repos/${id}`, { method: 'DELETE' }),
    branches: (id, worktree) =>
      req(`/api/repos/${id}/branches${worktree ? `?worktree=${encodeURIComponent(worktree)}` : ''}`),
    refresh: (id) => req(`/api/repos/${id}/refresh`, { method: 'POST' }),
  },
  reviews: {
    list: (repoId) => req(`/api/reviews${repoId ? `?repo_id=${repoId}` : ''}`),
    create: (body) => req('/api/reviews', { method: 'POST', body }),
    get: (id) => req(`/api/reviews/${id}`),
    delete: (id) => req(`/api/reviews/${id}`, { method: 'DELETE' }),
    diff: (id, opts = {}) => {
      const params = new URLSearchParams();
      if (opts.ignoreWhitespace) params.set('w', '1');
      return req(`/api/reviews/${id}/diff?${params}`);
    },
    commits: (id) => req(`/api/reviews/${id}/commits`),
    commitDiff: (id, sha, mode = 'cumulative', ignoreWhitespace = false) => {
      const p = new URLSearchParams({ sha, mode });
      if (ignoreWhitespace) p.set('w', '1');
      return req(`/api/reviews/${id}/commit-diff?${p}`);
    },
    risk: (id) => req(`/api/reviews/${id}/risk`),
    reviewed: (id) => req(`/api/reviews/${id}/reviewed`),
    markReviewed: (id, file, sha) =>
      req(`/api/reviews/${id}/files/${encodeURIComponent(file)}/reviewed`, {
        method: 'POST',
        body: { reviewed_sha: sha },
      }),
    unmarkReviewed: (id, file) =>
      req(`/api/reviews/${id}/files/${encodeURIComponent(file)}/reviewed`, { method: 'DELETE' }),
  },
  comments: {
    list: (reviewId) => req(`/api/comments?review_id=${reviewId}`),
    create: (body) => req('/api/comments', { method: 'POST', body }),
    update: (id, body) => req(`/api/comments/${id}`, { method: 'PATCH', body }),
    delete: (id) => req(`/api/comments/${id}`, { method: 'DELETE' }),
  },
  agents: {
    list: () => req('/api/agents'),
    create: (body) => req('/api/agents', { method: 'POST', body }),
    update: (id, body) => req(`/api/agents/${id}`, { method: 'PATCH', body }),
    delete: (id) => req(`/api/agents/${id}`, { method: 'DELETE' }),
    start: (review_id, agent_config_ids) =>
      req('/api/agents/runs', { method: 'POST', body: { review_id, agent_config_ids } }),
    runs: (reviewId) => req(`/api/agents/runs?review_id=${reviewId}`),
    runDetail: (runId) => req(`/api/agents/runs/${runId}`),
    rerun: (runId) => req(`/api/agents/runs/${runId}/rerun`, { method: 'POST' }),
  },
  settings: {
    get: () => req('/api/settings'),
    put: (body) => req('/api/settings', { method: 'PUT', body }),
  },
  goals: {
    list: () => req('/api/goals'),
    create: (body) => req('/api/goals', { method: 'POST', body }),
    update: (id, body) => req(`/api/goals/${id}`, { method: 'PATCH', body }),
    delete: (id) => req(`/api/goals/${id}`, { method: 'DELETE' }),
  },
  admin: {
    stats: () => req('/api/admin/stats'),
    clearReviews: () => req('/api/admin/clear-reviews', { method: 'POST' }),
    clearAll: () => req('/api/admin/clear-all', { method: 'POST' }),
  },
  fix: {
    pending: (reviewId) => req(`/api/reviews/${reviewId}/fix/pending`),
    /* Streams ndjson events to onEvent. Resolves when the server closes. */
    async run(reviewId, agentConfigId, onEvent) {
      const res = await fetch(`/api/reviews/${reviewId}/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_config_id: agentConfigId }),
      });
      if (!res.ok && !res.body) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          try { onEvent(JSON.parse(line)); } catch (e) { console.warn('bad ndjson line', line); }
        }
      }
      if (buf.trim()) {
        try { onEvent(JSON.parse(buf)); } catch {}
      }
    },
  },
};
