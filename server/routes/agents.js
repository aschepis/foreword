import express from 'express';
import { db } from '../db.js';
import { runAgent } from '../services/agent-runner.js';

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM agent_configs ORDER BY created_at ASC').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const {
    name, command, prompt_template, enabled = 1, include_goals = 0, kind = 'review',
    provider = null, model = null,
  } = req.body || {};
  if (!name || !command || !prompt_template) {
    return res.status(400).json({ error: 'name, command, prompt_template required' });
  }
  if (!['review', 'fix'].includes(kind)) return res.status(400).json({ error: 'kind must be review or fix' });
  const info = db
    .prepare('INSERT INTO agent_configs (name, command, prompt_template, enabled, include_goals, kind, provider, model) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(name, command, prompt_template, enabled ? 1 : 0, include_goals ? 1 : 0, kind, provider, model);
  res.json(db.prepare('SELECT * FROM agent_configs WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/:id', (req, res) => {
  const fields = [];
  const args = [];
  for (const k of ['name', 'command', 'prompt_template', 'enabled', 'include_goals', 'kind', 'provider', 'model']) {
    if (k in (req.body || {})) {
      fields.push(`${k} = ?`);
      args.push(['enabled', 'include_goals'].includes(k) ? (req.body[k] ? 1 : 0) : req.body[k]);
    }
  }
  if (!fields.length) return res.json({ ok: true });
  args.push(req.params.id);
  db.prepare(`UPDATE agent_configs SET ${fields.join(', ')} WHERE id = ?`).run(...args);
  res.json(db.prepare('SELECT * FROM agent_configs WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM agent_configs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/runs', async (req, res, next) => {
  try {
    const { review_id, agent_config_ids } = req.body || {};
    if (!review_id || !Array.isArray(agent_config_ids) || !agent_config_ids.length) {
      return res.status(400).json({ error: 'review_id and agent_config_ids[] required' });
    }
    const results = await Promise.all(
      agent_config_ids.map((id) =>
        runAgent({ reviewId: review_id, agentConfigId: id })
          .then((r) => ({ ok: true, agentConfigId: id, ...r }))
          .catch((e) => ({ ok: false, agentConfigId: id, error: e.message }))
      )
    );
    const anyFailed = results.some((r) => !r.ok);
    res.json({ results, anyFailed });
  } catch (e) { next(e); }
});

router.get('/runs', (req, res) => {
  const reviewId = req.query.review_id;
  if (!reviewId) return res.status(400).json({ error: 'review_id required' });
  /* exclude heavy prompt/stdout fields from the list view */
  const runs = db
    .prepare(`SELECT id, review_id, agent_config_id, agent_name, status, started_at,
              finished_at, command, exit_code, duration_ms, finding_count, kind, target_comment_id
              FROM agent_runs WHERE review_id = ? ORDER BY started_at DESC`)
    .all(reviewId);
  const findings = db
    .prepare('SELECT * FROM agent_findings WHERE review_id = ? ORDER BY id ASC')
    .all(reviewId);
  res.json({ runs, findings });
});

router.post('/runs/:id/rerun', async (req, res, next) => {
  try {
    const run = db.prepare('SELECT review_id, agent_config_id FROM agent_runs WHERE id = ?').get(req.params.id);
    if (!run) return res.status(404).json({ error: 'run not found' });
    const result = await runAgent({ reviewId: run.review_id, agentConfigId: run.agent_config_id });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/runs/:id', (req, res) => {
  const run = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(req.params.id);
  if (!run) return res.status(404).json({ error: 'run not found' });
  const findings = db
    .prepare('SELECT * FROM agent_findings WHERE agent_run_id = ? ORDER BY id ASC')
    .all(run.id);
  res.json({ run, findings });
});

export default router;
