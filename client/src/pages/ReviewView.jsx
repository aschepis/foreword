import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import DiffView, { fileIdFor } from '../components/DiffView.jsx';
import FileSidebar from '../components/FileSidebar.jsx';
import RiskRadar from '../components/RiskRadar.jsx';
import TimeTravel from '../components/TimeTravel.jsx';
import AgentPanel from '../components/AgentPanel.jsx';
import CommentDialog from '../components/CommentDialog.jsx';

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

  async function submitComment(body) {
    const a = anchor;
    setAnchor(null);
    await api.comments.create({
      review_id: reviewId,
      path: a.file || null,
      line: a.line || null,
      side: a.side || null,
      body,
    });
    loadComments();
  }

  async function submitGlobal(body) {
    setGlobalCommentOpen(false);
    await api.comments.create({ review_id: reviewId, body });
    loadComments();
  }

  // keyboard nav
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === ',') setScrubIndex((i) => Math.max(-1, i - 1));
      if (e.key === '.') setScrubIndex((i) => Math.min(commits.length - 1, i + 1));
      if (e.key === '?') alert('Shortcuts:\n,  prev commit\n.  next commit\nw  toggle whitespace\nf  toggle inline/side-by-side\ng  global comment\ndouble-click line: add comment');
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
        <div className="p-3 border-b border-bg-line bg-bg-soft sticky top-0 z-10">
          <div className="flex items-center gap-3 text-sm">
            <Link to={`/repos/${review.repo_id}`} className="text-text-muted hover:text-accent">← repo</Link>
            <div className="font-mono">
              <span className="text-accent">{review.head_ref}</span>
              <span className="text-text-muted"> ← </span>
              <span className="text-accent-purple">{review.base_ref}</span>
            </div>
            <div className="text-xs text-text-dim">
              {review.base_sha?.slice(0,7)}…{review.head_sha?.slice(0,7)}
            </div>
            <div className="ml-auto flex items-center gap-3 text-xs">
              <span className="text-text-muted">
                {reviewedCount}/{diffData?.files?.length || 0} reviewed
              </span>
              <label className="flex items-center gap-1 text-text-muted">
                <input type="checkbox" checked={ignoreWs} onChange={(e) => setIgnoreWs(e.target.checked)} />
                ignore whitespace
              </label>
              <select
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value)}
                className="bg-bg border border-bg-line rounded px-1 py-0.5"
              >
                <option value="side-by-side">side-by-side</option>
                <option value="line-by-line">unified</option>
              </select>
              <button onClick={() => setGlobalCommentOpen(true)} className="text-accent hover:underline">+ global comment</button>
            </div>
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

          {globalComments.length > 0 && (
            <div className="bg-bg-soft border border-bg-line rounded p-3 mb-3">
              <h3 className="text-sm font-semibold mb-2">Global comments ({globalComments.length})</h3>
              <ul className="space-y-2">
                {globalComments.map((c) => (
                  <li key={c.id} className="text-sm">
                    <div className="text-xs text-text-muted">
                      <b>{c.author}</b> • {c.created_at}
                    </div>
                    <div className="whitespace-pre-wrap">{c.body}</div>
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
            fileStatus={fileStatus}
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
