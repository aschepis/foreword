import express from 'express';
import { runFixes, listPendingFixes } from '../services/fix-runner.js';
import { log } from '../log.js';
import { db } from '../db.js';

const router = express.Router();

/** Status preview — how many fixable comments are pending? */
router.get('/:id/fix/pending', (req, res) => {
  const reviewId = req.params.id;
  const pending = listPendingFixes(reviewId);
  res.json({ pending_count: pending.length, pending });
});

/**
 * Kick off a fix session. Streams newline-delimited JSON events to the client
 * so progress is visible as each comment is processed.
 */
router.post('/:id/fix', async (req, res) => {
  const reviewId = req.params.id;
  const { agent_config_id } = req.body || {};
  if (!agent_config_id) {
    return res.status(400).json({ error: 'agent_config_id required' });
  }

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  function emit(event) {
    res.write(JSON.stringify(event) + '\n');
  }

  try {
    await runFixes({ reviewId, agentConfigId: agent_config_id, emit });
  } catch (e) {
    log.error(`fix session for review ${reviewId} threw`, e);
    emit({ type: 'error', error: e.message });
  }
  res.end();
});

export default router;
