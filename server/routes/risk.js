import express from 'express';
import { computeRisk } from '../services/risk-scorer.js';

const router = express.Router();

router.get('/:id/risk', async (req, res, next) => {
  try {
    const risk = await computeRisk(req.params.id);
    res.json(risk);
  } catch (e) { next(e); }
});

export default router;
