import express from 'express';
import { getSetting, setSetting } from '../db.js';

const router = express.Router();
const KEYS = ['author', 'theme', 'ignore_whitespace'];

router.get('/', (req, res) => {
  const out = {};
  for (const k of KEYS) out[k] = getSetting(k, null);
  res.json(out);
});

router.put('/', (req, res) => {
  const body = req.body || {};
  for (const k of KEYS) {
    if (k in body) setSetting(k, body[k]);
  }
  const out = {};
  for (const k of KEYS) out[k] = getSetting(k, null);
  res.json(out);
});

export default router;
