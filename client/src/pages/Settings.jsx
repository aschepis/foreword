import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { AGENT_PRESETS, PRESET_ORDER } from '../agentPresets.js';

const REVIEW_TEMPLATE =
  'You are a code reviewer. Review the following unified diff and respond ONLY with a JSON array of findings. Each finding must have: {"file": "path/relative/to/repo", "line": <line number in NEW file or null>, "severity": "info|warn|error", "message": "..."}.\n\n{{goals}}\nDiff:\n{{diff}}';

const FIX_TEMPLATE =
  'You are a code-fix assistant working in the repository at {{worktree}}.\n\nA reviewer has requested the following change in their review of {{base}}..{{head}}.\n\nFile: {{file}}\nLine: {{line}}\n\nConversation:\n{{thread_context}}\n\nMake the requested change as described above.\n\nConstraints:\n- Do NOT make any unrelated changes.\n- Stage and commit ONLY the files you modify.\n- Use a commit message starting with "fix(foreword):" followed by a short imperative summary.\n- Create exactly ONE commit for this change.\n- If you determine no change is needed, do NOT commit; instead respond briefly explaining why.';

const EMPTY_AGENT = {
  name: '',
  command: AGENT_PRESETS.claude.buildCommand(AGENT_PRESETS.claude.defaultModel, 'review'),
  prompt_template: REVIEW_TEMPLATE,
  enabled: 1,
  include_goals: 0,
  kind: 'review',
  provider: 'claude',
  model: AGENT_PRESETS.claude.defaultModel,
};

const EMPTY_GOAL = { title: '', body: '', enabled: 1 };

export default function Settings() {
  const [agents, setAgents] = useState([]);
  const [goals, setGoals] = useState([]);
  const [editingAgent, setEditingAgent] = useState(null);
  const [editingGoal, setEditingGoal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [stats, setStats] = useState(null);
  const [adminBusy, setAdminBusy] = useState(false);

  async function load() {
    const [a, g] = await Promise.all([api.agents.list(), api.goals.list()]);
    setAgents(a); setGoals(g);
    try { setStats(await api.admin.stats()); } catch {}
  }
  useEffect(() => { load(); }, []);

  async function clearReviews() {
    const msg = `Delete ALL ${stats?.reviews ?? '?'} review(s), ${stats?.comments ?? '?'} comment(s), ` +
                `${stats?.agent_runs ?? '?'} agent run(s), and ${stats?.agent_findings ?? '?'} finding(s)?\n\n` +
                `Repos, worktrees, agent configs, and goals will be kept.\n\nThis cannot be undone.`;
    if (!confirm(msg)) return;
    setAdminBusy(true);
    try { await api.admin.clearReviews(); await load(); }
    finally { setAdminBusy(false); }
  }

  async function clearAll() {
    const msg = `NUCLEAR: wipe EVERYTHING — repos, worktrees, reviews, comments, agent configs, ` +
                `goals, agent runs, findings, and settings.\n\nType "DELETE EVERYTHING" to confirm.`;
    const answer = prompt(msg);
    if (answer !== 'DELETE EVERYTHING') return;
    setAdminBusy(true);
    try { await api.admin.clearAll(); await load(); alert('All data cleared.'); }
    finally { setAdminBusy(false); }
  }

  async function saveAgent(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (editingAgent.id) await api.agents.update(editingAgent.id, editingAgent);
      else await api.agents.create(editingAgent);
      setEditingAgent(null);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function toggleAgent(a) {
    await api.agents.update(a.id, { enabled: a.enabled ? 0 : 1 });
    load();
  }

  async function delAgent(a) {
    if (!confirm(`Delete agent "${a.name}"?`)) return;
    await api.agents.delete(a.id);
    load();
  }

  async function saveGoal(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (editingGoal.id) await api.goals.update(editingGoal.id, editingGoal);
      else await api.goals.create(editingGoal);
      setEditingGoal(null);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function toggleGoal(g) {
    await api.goals.update(g.id, { enabled: g.enabled ? 0 : 1 });
    load();
  }

  async function delGoal(g) {
    if (!confirm(`Delete goal "${g.title}"?`)) return;
    await api.goals.delete(g.id);
    load();
  }

  const enabledGoalCount = goals.filter((g) => g.enabled).length;

  return (
    <div className="max-w-3xl mx-auto p-6 pb-12">
      {/* ─── Goals ─── */}
      <h1 className="text-xl mb-2">Review goals</h1>
      <p className="text-sm text-text-muted mb-4">
        Persistent things you care about in every review (security gotchas, style rules,
        domain-specific invariants). Agents that have <b>Include goals</b> turned on get these
        injected into their prompt — either at the <code className="bg-bg-soft px-1 rounded">{'{{goals}}'}</code>{' '}
        placeholder or auto-prepended.
      </p>
      <ul className="space-y-2 mb-3">
        {goals.length === 0 && (
          <li className="text-sm text-text-muted border border-dashed border-bg-line rounded p-4 text-center">
            No goals yet. Add one to bias your AI reviews toward what matters.
          </li>
        )}
        {goals.map((g) => (
          <li key={g.id} className="bg-bg-soft border border-bg-line rounded p-3">
            <div className="flex items-start gap-2">
              <button onClick={() => toggleGoal(g)}
                      className={`text-xs px-2 py-0.5 rounded shrink-0 ${g.enabled ? 'bg-accent-green/20 text-accent-green' : 'bg-bg-line text-text-muted'}`}>
                {g.enabled ? 'enabled' : 'disabled'}
              </button>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{g.title}</div>
                {g.body && <div className="text-xs text-text-muted mt-0.5 whitespace-pre-wrap">{g.body}</div>}
              </div>
              <button onClick={() => setEditingGoal(g)} className="text-xs text-accent hover:underline">edit</button>
              <button onClick={() => delGoal(g)} className="text-xs text-accent-red hover:underline">delete</button>
            </div>
          </li>
        ))}
      </ul>
      <button onClick={() => setEditingGoal(EMPTY_GOAL)} className="bg-accent text-bg font-semibold rounded px-3 py-2 text-sm">
        + new goal
      </button>

      {/* ─── Agents ─── */}
      <h1 className="text-xl mt-10 mb-2">AI agents</h1>
      <p className="text-sm text-text-muted mb-4">
        Shell commands that review diffs. Your prompt template receives{' '}
        <code className="bg-bg-soft px-1 rounded">{'{{diff}}'}</code>,{' '}
        <code className="bg-bg-soft px-1 rounded">{'{{file_paths}}'}</code>,{' '}
        <code className="bg-bg-soft px-1 rounded">{'{{base}}'}</code>,{' '}
        <code className="bg-bg-soft px-1 rounded">{'{{head}}'}</code>, and (when{' '}
        <i>Include goals</i> is on) <code className="bg-bg-soft px-1 rounded">{'{{goals}}'}</code> on stdin.
        Output should be a JSON array of findings.
      </p>

      <ul className="space-y-2 mb-4">
        {agents.map((a) => (
          <li key={a.id} className="bg-bg-soft border border-bg-line rounded p-3">
            <div className="flex items-center gap-2">
              <button onClick={() => toggleAgent(a)}
                      className={`text-xs px-2 py-0.5 rounded ${a.enabled ? 'bg-accent-green/20 text-accent-green' : 'bg-bg-line text-text-muted'}`}>
                {a.enabled ? 'enabled' : 'disabled'}
              </button>
              <div className="font-semibold">{a.name}</div>
              <span className={`text-[10px] px-2 py-0.5 rounded ${a.kind === 'fix' ? 'bg-accent-yellow/20 text-accent-yellow' : 'bg-accent/20 text-accent'}`}>
                {a.kind === 'fix' ? '🔧 fix' : '🔍 review'}
              </span>
              {a.provider && a.provider !== 'other' && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-bg-line text-text-muted">
                  {AGENT_PRESETS[a.provider]?.label || a.provider}
                  {a.model ? ` · ${a.model}` : ''}
                </span>
              )}
              {a.include_goals ? (
                <span className="text-[10px] px-2 py-0.5 rounded bg-accent-purple/20 text-accent-purple"
                      title={`Will receive ${enabledGoalCount} enabled goal${enabledGoalCount === 1 ? '' : 's'} in the prompt`}>
                  🎯 goals ({enabledGoalCount})
                </span>
              ) : null}
              <div className="font-mono text-xs text-text-muted flex-1 truncate">{a.command}</div>
              <button
                onClick={() => {
                  /* For preset-based agents, regenerate the command from the
                     current preset on edit-open so stale stored commands get
                     healed when the user saves. */
                  const preset = a.provider && a.provider !== 'other' ? AGENT_PRESETS[a.provider] : null;
                  if (preset && a.model) {
                    const fresh = preset.buildCommand(a.model, a.kind || 'review');
                    setEditingAgent({ ...a, command: fresh, _originalCommand: a.command });
                  } else {
                    setEditingAgent(a);
                  }
                }}
                className="text-xs text-accent hover:underline">edit</button>
              <button onClick={() => delAgent(a)} className="text-xs text-accent-red hover:underline">delete</button>
            </div>
          </li>
        ))}
      </ul>
      <button onClick={() => setEditingAgent(EMPTY_AGENT)} className="bg-accent text-bg font-semibold rounded px-3 py-2 text-sm">
        + new agent
      </button>

      {/* ─── Danger zone ─── */}
      <div className="mt-10 border border-accent-red/40 rounded-lg p-4 bg-accent-red/5">
        <h2 className="font-semibold text-accent-red mb-2">Danger zone</h2>
        {stats && (
          <div className="text-xs text-text-muted font-mono mb-3">
            {stats.repos} repos · {stats.worktrees} worktrees · {stats.reviews} reviews ·{' '}
            {stats.comments} comments · {stats.agent_configs} agents · {stats.goals} goals ·{' '}
            {stats.agent_runs} runs · {stats.agent_findings} findings · {stats.file_reviewed} file-marks
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border border-bg-line rounded p-3 bg-bg-soft">
            <div className="font-semibold text-sm mb-1">Clear all reviews</div>
            <div className="text-xs text-text-muted mb-3">
              Deletes every review, comment, file-reviewed mark, agent run, and finding.
              Keeps repos, worktrees, agents, and goals.
            </div>
            <button onClick={clearReviews} disabled={adminBusy}
                    className="text-sm bg-accent-yellow/20 text-accent-yellow rounded px-3 py-1.5 hover:bg-accent-yellow/30 disabled:opacity-50">
              Clear reviews
            </button>
          </div>
          <div className="border border-accent-red/40 rounded p-3 bg-bg-soft">
            <div className="font-semibold text-sm mb-1 text-accent-red">Clean slate</div>
            <div className="text-xs text-text-muted mb-3">
              Wipes <b>everything</b> — including repos, agent configs, goals, and settings.
            </div>
            <button onClick={clearAll} disabled={adminBusy}
                    className="text-sm bg-accent-red/20 text-accent-red rounded px-3 py-1.5 hover:bg-accent-red/30 disabled:opacity-50">
              Delete everything…
            </button>
          </div>
        </div>
      </div>

      {/* ─── Agent modal ─── */}
      {editingAgent && (() => {
        const provider = editingAgent.provider || 'other';
        const preset = AGENT_PRESETS[provider] || AGENT_PRESETS.other;
        const setKind = (newKind) => {
          const shouldReplaceTpl = editingAgent.prompt_template === REVIEW_TEMPLATE ||
                                    editingAgent.prompt_template === FIX_TEMPLATE ||
                                    !editingAgent.id;
          const newCommand = provider !== 'other'
            ? preset.buildCommand(editingAgent.model || preset.defaultModel, newKind)
            : editingAgent.command;
          setEditingAgent({
            ...editingAgent,
            kind: newKind,
            command: newCommand,
            prompt_template: shouldReplaceTpl
              ? (newKind === 'fix' ? FIX_TEMPLATE : REVIEW_TEMPLATE)
              : editingAgent.prompt_template,
          });
        };
        const setProvider = (newProv) => {
          const newPreset = AGENT_PRESETS[newProv];
          if (newProv === 'other') {
            setEditingAgent({ ...editingAgent, provider: 'other', model: null });
          } else {
            const newModel = newPreset.defaultModel;
            setEditingAgent({
              ...editingAgent,
              provider: newProv,
              model: newModel,
              command: newPreset.buildCommand(newModel, editingAgent.kind || 'review'),
            });
          }
        };
        const setModel = (newModel) => {
          if (provider === 'other') return;
          setEditingAgent({
            ...editingAgent,
            model: newModel,
            command: preset.buildCommand(newModel, editingAgent.kind || 'review'),
          });
        };

        return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
             onClick={() => setEditingAgent(null)}>
          <form onSubmit={saveAgent} onClick={(e) => e.stopPropagation()}
                className="bg-bg-soft border border-bg-line rounded-lg p-4 w-full max-w-2xl space-y-3 max-h-[90vh] overflow-auto">
            <h2 className="font-semibold">{editingAgent.id ? 'Edit agent' : 'New agent'}</h2>
            <div className="flex gap-2">
              {[
                { id: 'review', label: '🔍 Review', hint: 'Suggests findings; never modifies files.' },
                { id: 'fix', label: '🔧 Fix', hint: 'Modifies files + commits to address fixable comments.' },
              ].map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKind(k.id)}
                  className={`flex-1 text-left border rounded p-3 ${editingAgent.kind === k.id ? 'border-accent bg-accent/10' : 'border-bg-line bg-bg hover:border-text-muted'}`}
                >
                  <div className="font-semibold text-sm">{k.label}</div>
                  <div className="text-xs text-text-muted">{k.hint}</div>
                </button>
              ))}
            </div>
            <label className="block">
              <div className="text-xs text-text-muted mb-1">Name</div>
              <input className="w-full bg-bg border border-bg-line rounded px-2 py-1.5 text-sm"
                     value={editingAgent.name} onChange={(e) => setEditingAgent({...editingAgent, name: e.target.value})} />
            </label>

            <div>
              <div className="text-xs text-text-muted mb-1">Agent</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {PRESET_ORDER.map((id) => {
                  const p = AGENT_PRESETS[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setProvider(id)}
                      className={`text-left border rounded px-2 py-2 ${provider === id ? 'border-accent bg-accent/10' : 'border-bg-line bg-bg hover:border-text-muted'}`}
                    >
                      <div className="font-semibold text-sm">{p.label}</div>
                    </button>
                  );
                })}
              </div>
              {preset.hint && (
                <div className="text-[11px] text-text-muted mt-1.5">{preset.hint}</div>
              )}
            </div>

            {provider !== 'other' && preset.models?.length > 0 && (
              <label className="block">
                <div className="text-xs text-text-muted mb-1">Model</div>
                <select
                  className="w-full bg-bg border border-bg-line rounded px-2 py-1.5 text-sm"
                  value={editingAgent.model || preset.defaultModel}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {preset.models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </label>
            )}

            <label className="block">
              <div className="text-xs text-text-muted mb-1 flex items-center gap-2">
                <span>Shell command — receives prompt on stdin</span>
                {provider !== 'other' && (
                  <span className="text-text-dim">(auto-generated; switch to "Other" to fully customize)</span>
                )}
                {provider !== 'other' && (
                  <button
                    type="button"
                    onClick={() => setModel(editingAgent.model || preset.defaultModel)}
                    className="text-accent hover:underline ml-auto"
                    title="Regenerate the command from the current preset + model"
                  >↻ regenerate</button>
                )}
              </div>
              <input className="w-full bg-bg border border-bg-line rounded px-2 py-1.5 text-sm font-mono disabled:opacity-70"
                     placeholder={editingAgent.kind === 'fix'
                       ? 'e.g. claude -p --permission-mode acceptEdits --output-format json'
                       : 'e.g. claude -p --output-format json'}
                     value={editingAgent.command}
                     disabled={provider !== 'other'}
                     onChange={(e) => setEditingAgent({...editingAgent, command: e.target.value})} />
              {editingAgent._originalCommand && editingAgent._originalCommand !== editingAgent.command && (
                <div className="text-[11px] text-accent-yellow mt-1">
                  ⚠ Stored command was <span className="font-mono">{editingAgent._originalCommand}</span> — will be replaced on save.
                </div>
              )}
            </label>
            <label className="block">
              <div className="text-xs text-text-muted mb-1">Prompt template</div>
              <textarea rows={8}
                     className="w-full bg-bg border border-bg-line rounded px-2 py-1.5 text-sm font-mono"
                     value={editingAgent.prompt_template}
                     onChange={(e) => setEditingAgent({...editingAgent, prompt_template: e.target.value})} />
            </label>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editingAgent.enabled}
                       onChange={(e) => setEditingAgent({...editingAgent, enabled: e.target.checked ? 1 : 0})} />
                Enabled
              </label>
              <label className="flex items-center gap-2 text-sm" title={`Adds ${enabledGoalCount} enabled goal(s) to the prompt`}>
                <input type="checkbox" checked={!!editingAgent.include_goals}
                       onChange={(e) => setEditingAgent({...editingAgent, include_goals: e.target.checked ? 1 : 0})} />
                Include goals
                <span className="text-xs text-text-muted">({enabledGoalCount} enabled)</span>
              </label>
            </div>
            {err && <div className="text-accent-red text-sm">{err}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingAgent(null)} className="text-text-muted text-sm px-3 py-1">cancel</button>
              <button type="submit" disabled={busy} className="bg-accent text-bg font-semibold rounded px-3 py-1 text-sm">
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
        );
      })()}

      {/* ─── Goal modal ─── */}
      {editingGoal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
             onClick={() => setEditingGoal(null)}>
          <form onSubmit={saveGoal} onClick={(e) => e.stopPropagation()}
                className="bg-bg-soft border border-bg-line rounded-lg p-4 w-full max-w-xl space-y-3">
            <h2 className="font-semibold">{editingGoal.id ? 'Edit goal' : 'New goal'}</h2>
            <label className="block">
              <div className="text-xs text-text-muted mb-1">Title</div>
              <input autoFocus className="w-full bg-bg border border-bg-line rounded px-2 py-1.5 text-sm"
                     placeholder="e.g. Audit-log every state-changing handler"
                     value={editingGoal.title} onChange={(e) => setEditingGoal({...editingGoal, title: e.target.value})} />
            </label>
            <label className="block">
              <div className="text-xs text-text-muted mb-1">Details (optional)</div>
              <textarea rows={4}
                     className="w-full bg-bg border border-bg-line rounded px-2 py-1.5 text-sm"
                     placeholder="Anything the reviewer should know — gotchas, prior incidents, examples."
                     value={editingGoal.body} onChange={(e) => setEditingGoal({...editingGoal, body: e.target.value})} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!editingGoal.enabled}
                     onChange={(e) => setEditingGoal({...editingGoal, enabled: e.target.checked ? 1 : 0})} />
              Enabled
            </label>
            {err && <div className="text-accent-red text-sm">{err}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingGoal(null)} className="text-text-muted text-sm px-3 py-1">cancel</button>
              <button type="submit" disabled={busy} className="bg-accent text-bg font-semibold rounded px-3 py-1 text-sm">
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
