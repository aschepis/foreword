import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import DiffView, { fileIdFor } from '../components/DiffView.jsx';
import FileSidebar from '../components/FileSidebar.jsx';
import RiskRadar from '../components/RiskRadar.jsx';
import TimeTravel from '../components/TimeTravel.jsx';
import AgentPanel from '../components/AgentPanel.jsx';
import FixPanel from '../components/FixPanel.jsx';
import CommentDialog from '../components/CommentDialog.jsx';
import DriftBanner from '../components/DriftBanner.jsx';
import { useDriftPoll } from '../lib/useDriftPoll.js';

export default function ReviewView() {
  const { reviewId } = useParams();
  const [review, setReview] = useState(null);
  const [diffData, setDiffData] = useState(null);
  const [reviewed, setReviewed] = useState(new Map());
  const [ignoreWs, setIgnoreWs] = useState(false);
  const [outputFormat, setOutputFormat] = useState('line-by-line');
  const [comments, setComments] = useState([]);
  const [agentRuns, setAgentRuns] = useState({ runs: [], findings: [] });
  const [risk, setRisk] = useState(null);
  const [commits, setCommits] = useState([]);
  const [scrubIndex, setScrubIndex] = useState(-1);
  const [scrubMode, setScrubMode] = useState('cumulative');
  const [scrubDiff, setScrubDiff] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const [globalCommentOpen, setGlobalCommentOpen] = useState(false);

  async function loadReview() { setReview(await api.reviews.get(reviewId)); }
  async function loadDiff() {
    const d = await api.reviews.diff(reviewId, { ignoreWhitespace: ignoreWs });
    setDiffData(d);
  }
  async function loadReviewed() {
    const rows = await api.reviews.reviewed(reviewId);
    setReviewed(new Map(rows.map((r) => [r.path, r])));
  }
  async function loadComments() { setComments(await api.comments.list(reviewId)); }
  async function loadAgents() { setAgentRuns(await api.agents.runs(reviewId)); }
  async function loadRisk() {
    try { setRisk(await api.reviews.risk(reviewId)); } catch (e) { console.warn(e); }
  }
  async function loadCommits() {
    try { setCommits(await api.reviews.commits(reviewId)); } catch (e) { console.warn(e); }
  }

  useEffect(() => {
    loadReview(); loadReviewed(); loadComments(); loadAgents(); loadRisk(); loadCommits();
  }, [reviewId]);
  useEffect(() => { loadDiff(); }, [reviewId, ignoreWs]);

  useEffect(() => {
    if (scrubIndex < 0) { setScrubDiff(null); return; }
    const c = commits[scrubIndex];
    if (!c) return;
    api.reviews.commitDiff(reviewId, c.hash, scrubMode, ignoreWs).then((d) => setScrubDiff(d.diff));
  }, [scrubIndex, scrubMode, ignoreWs, commits, reviewId]);

  const commentsByLine = useMemo(() => {
    const map = new Map();
    for (const c of comments) {
      if (!c.path || !c.line) continue;
      if (!map.has(c.path)) map.set(c.path, new Map());
      const file = map.get(c.path);
      const tid = c.parent_id || c.id;
      if (!file.has(c.line)) file.set(c.line, new Map());
      const lineThreads = file.get(c.line);
      if (!lineThreads.has(tid)) lineThreads.set(tid, []);
      lineThreads.get(tid).push(c);
    }
    const out = new Map();
    for (const [file, lineMap] of map) {
      const inner = new Map();
      for (const [line, threads] of lineMap) inner.set(line, [...threads.values()]);
      out.set(file, inner);
    }
    return out;
  }, [comments]);

  const globalComments = useMemo(() => comments.filter((c) => !c.path), [comments]);

  const riskByPath = useMemo(() => {
    if (!risk?.files) return new Map();
    return new Map(risk.files.map((f) => [f.path, f]));
  }, [risk]);

  const jumpToFile = useCallback((file) => {
    const el = document.getElementById(fileIdFor(file));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const fileStatus = useMemo(() => {
    const m = new Map();
    for (const [path, r] of reviewed) {
      const cur = diffData?.file_shas?.[path];
      if (cur && r.reviewed_sha === cur) m.set(path, 'reviewed');
      else if (cur) m.set(path, 'stale');
    }
    return m;
  }, [reviewed, diffData]);

  async function onToggleReviewed(file, sha, currentlyDone) {
    if (currentlyDone) {
      await api.reviews.unmarkReviewed(reviewId, file);
    } else {
      await api.reviews.markReviewed(reviewId, file, sha || 'unknown');
    }
    loadReviewed();
  }

  async function submitComment({ body, agent_fixable }) {
    const a = anchor;
    setAnchor(null);
    await api.comments.create({
      review_id: reviewId,
      parent_id: a.parentComment?.id || null,
      path: a.file || a.parentComment?.path || null,
      line: a.line || a.parentComment?.line || null,
      side: a.side || a.parentComment?.side || null,
      body,
      agent_fixable: agent_fixable ? 1 : 0,
    });
    loadComments();
  }

  async function submitGlobal({ body, agent_fixable }) {
    setGlobalCommentOpen(false);
    await api.comments.create({
      review_id: reviewId, body,
      agent_fixable: agent_fixable ? 1 : 0,
    });
    loadComments();
  }

  async function reloadAfterFix() {
    /* Fix runs update the review's head_sha, so refetch everything that depends on it. */
    await loadReview();
    await loadDiff();
    await loadComments();
    await loadRisk();
    await loadCommits();
    await loadAgents();
  }

  /* ── Worktree drift detection ──────────────────────────────────────── */
  const { state: driftState, refresh: refetchDrift } = useDriftPoll(reviewId);
  const [refreshing, setRefreshing] = useState(false);

  /* ── MCP handoff: "Send to agent" ──────────────────────────────────── */
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState(null);

  async function sendToAgent() {
    if (!review?.mcp_session_id) return;
    setSending(true);
    try {
      const r = await api.reviews.signal(reviewId);
      setSentAt(r.signaled_at);
    } catch (e) { console.warn('signal failed', e); }
    finally { setSending(false); }
  }

  async function refreshHead() {
    setRefreshing(true);
    try {
      await api.reviews.refreshHead(reviewId);
      await reloadAfterFix();
      await refetchDrift();
    } finally { setRefreshing(false); }
  }

  // keyboard nav
  useEffect(() => {
    function focusFinding(delta) {
      /* All pinned findings = inline comment widgets in DOM order. Loops at ends. */
      const widgets = Array.from(document.querySelectorAll('.lr-thread'));
      if (widgets.length === 0) return;
      const currentIdx = widgets.findIndex((w) => w.classList.contains('lr-comment-focused'));
      let nextIdx;
      if (currentIdx === -1) {
        /* Pick the widget closest to viewport center on first activation */
        const center = window.innerHeight / 2;
        let best = 0, bestDist = Infinity;
        widgets.forEach((w, i) => {
          const rect = w.getBoundingClientRect();
          const dist = Math.abs((rect.top + rect.bottom) / 2 - center);
          if (dist < bestDist) { bestDist = dist; best = i; }
        });
        nextIdx = best;
      } else {
        nextIdx = (currentIdx + delta + widgets.length) % widgets.length;
      }
      widgets.forEach((w) => w.classList.remove('lr-comment-focused'));
      const target = widgets[nextIdx];
      target.classList.add('lr-comment-focused');
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === ',') setScrubIndex((i) => Math.max(-1, i - 1));
      if (e.key === '.') setScrubIndex((i) => Math.min(commits.length - 1, i + 1));
      if (e.key === 'j') { e.preventDefault(); focusFinding(+1); }
      if (e.key === 'k') { e.preventDefault(); focusFinding(-1); }
      if (e.key === '?') alert('Shortcuts:\n,  prev commit\n.  next commit\nj  next pinned finding (loops)\nk  prev pinned finding (loops)\nw  toggle whitespace\nf  toggle inline/side-by-side\ng  global comment\ndouble-click line: add comment');
      if (e.key === 'w') setIgnoreWs((v) => !v);
      if (e.key === 'f') setOutputFormat((m) => m === 'side-by-side' ? 'line-by-line' : 'side-by-side');
      if (e.key === 'g') setGlobalCommentOpen(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commits.length]);

  if (!review) return <div className="p-6 text-text-muted">Loading…</div>;

  const reviewedCount = [...reviewed.values()].filter((r) => {
    const cur = diffData?.file_shas?.[r.path];
    return cur && r.reviewed_sha === cur;
  }).length;

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      {diffData && (
        <FileSidebar
          files={diffData.files}
          reviewed={reviewed}
          fileShas={diffData.file_shas}
          onJump={jumpToFile}
          onToggleReviewed={onToggleReviewed}
          riskByPath={riskByPath}
        />
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="bg-bg-soft sticky top-0 z-10 border-b border-bg-line">
          {/* Top row: identity + controls */}
          <div className="px-4 py-2.5 flex items-center gap-4 text-sm">
            <Link to={`/repos/${review.repo_id}`} className="lr-eyebrow text-text-muted hover:text-text whitespace-nowrap">← Repo</Link>
            <div className="flex items-baseline gap-2 min-w-0">
              <div className="lr-eyebrow text-text-dim">Review</div>
              <div className="font-mono text-[13px] truncate">
                <span className="text-accent font-semibold">{review.head_ref}</span>
                <span className="text-text-muted mx-1.5">←</span>
                <span className="text-accent-purple">{review.base_ref}</span>
                <span className="text-text-dim text-[11px] ml-2">{review.base_sha?.slice(0,7)}…{review.head_sha?.slice(0,7)}</span>
                {review.mcp_session_id && (
                  <span className="text-[10px] px-2 py-0.5 rounded ml-2 lr-meta-badge-agent" title="This review was opened by an MCP-connected agent">
                    via MCP
                  </span>
                )}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-3 text-xs">
              <span className="lr-eyebrow text-text-muted whitespace-nowrap">
                {reviewedCount} / {diffData?.files?.length || 0} read
              </span>
              <label className="flex items-center gap-1.5 text-text-muted whitespace-nowrap cursor-pointer">
                <input type="checkbox" checked={ignoreWs} onChange={(e) => setIgnoreWs(e.target.checked)} />
                <span>ignore whitespace</span>
              </label>
              <select
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value)}
                className="text-xs"
              >
                <option value="side-by-side">side-by-side</option>
                <option value="line-by-line">unified</option>
              </select>
              <button onClick={() => setGlobalCommentOpen(true)} className="text-accent hover:underline whitespace-nowrap">+ note</button>
              <button
                onClick={refreshHead}
                disabled={refreshing}
                title="Refresh the diff against the worktree's current HEAD"
                className="text-text-muted hover:text-accent whitespace-nowrap disabled:opacity-50"
              >{refreshing ? '↻ …' : '↻ refresh'}</button>
              {review.mcp_session_id && (
                <button
                  onClick={sendToAgent}
                  disabled={sending}
                  title="Hand the review back to the MCP-connected agent"
                  className="bg-accent text-bg font-semibold rounded px-3 py-1 text-xs whitespace-nowrap disabled:opacity-50 hover:brightness-110"
                >
                  {sending ? 'Sending…' : sentAt ? '↩ sent' : '↩ Send to agent'}
                </button>
              )}
            </div>
          </div>
          {/* Drift banner — surfaces when worktree HEAD has moved */}
          <DriftBanner state={driftState} busy={refreshing} onRefresh={refreshHead} />
          {/* Reading-progress hairline */}
          <div className="lr-progress" aria-label={`${reviewedCount} of ${diffData?.files?.length || 0} files reviewed`}>
            <div
              className="lr-progress-fill"
              style={{ width: diffData?.files?.length ? `${(reviewedCount / diffData.files.length) * 100}%` : '0%' }}
            />
          </div>
        </div>

        <div className="p-3">
          <RiskRadar risk={risk} onJump={jumpToFile} />
          <TimeTravel
            commits={commits}
            index={scrubIndex}
            mode={scrubMode}
            onIndex={setScrubIndex}
            onMode={setScrubMode}
            onReset={() => setScrubIndex(-1)}
          />
          <AgentPanel
            reviewId={reviewId}
            runs={agentRuns.runs}
            findings={agentRuns.findings}
            onRefresh={() => { loadAgents(); loadComments(); loadRisk(); }}
          />
          <FixPanel
            reviewId={reviewId}
            comments={comments}
            onAfterRun={() => { loadComments(); loadAgents(); }}
            onReloadDiff={reloadAfterFix}
          />

          {globalComments.length > 0 && (
            <div className="lr-paper p-4 mb-4">
              <div className="lr-eyebrow mb-2">Notes · {globalComments.length}</div>
              <ul className="space-y-3 divide-y divide-bg-line">
                {globalComments.map((c, i) => (
                  <li key={c.id} className={`text-sm ${i > 0 ? 'pt-3' : ''}`}>
                    <div className="text-xs text-text-muted mb-1">
                      <b className="text-text">{c.author}</b> · <span className="text-text-dim font-mono">{c.created_at}</span>
                    </div>
                    <div className="lr-serif text-[14px] leading-relaxed whitespace-pre-wrap">{c.body}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DiffView
            diff={scrubIndex >= 0 ? scrubDiff : diffData?.diff}
            commentsByLine={commentsByLine}
            outputFormat={outputFormat}
            onAddComment={setAnchor}
            onReplyToComment={setAnchor}
            fileStatus={fileStatus}
            fileShas={diffData?.file_shas}
            onToggleReviewed={onToggleReviewed}
          />
        </div>
      </div>

      {anchor && (
        <CommentDialog anchor={anchor} onClose={() => setAnchor(null)} onSubmit={submitComment} />
      )}
      {globalCommentOpen && (
        <CommentDialog
          anchor={{ file: null, line: null }}
          onClose={() => setGlobalCommentOpen(false)}
          onSubmit={submitGlobal}
        />
      )}
    </div>
  );
}
