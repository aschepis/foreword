import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DATA_DIR } from './db.js';
import { log, requestLogger, banner } from './log.js';

import reposRouter from './routes/repos.js';
import reviewsRouter from './routes/reviews.js';
import diffsRouter from './routes/diffs.js';
import commentsRouter from './routes/comments.js';
import agentsRouter from './routes/agents.js';
import riskRouter from './routes/risk.js';
import settingsRouter from './routes/settings.js';
import adminRouter from './routes/admin.js';
import goalsRouter from './routes/goals.js';
import fixRouter from './routes/fix.js';
import mcpRouter from './mcp/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3200', 10);

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(requestLogger());

app.use('/api/repos', reposRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/reviews', diffsRouter);
app.use('/api/reviews', riskRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/reviews', fixRouter);
app.use('/mcp', mcpRouter);
log.info('MCP server mounted at /mcp (stateless, per-request server)');

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  log.error(`${req.method} ${req.originalUrl}`, err);
  res.status(err.status || 500).json({ error: err.message || String(err) });
});

const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => banner(PORT, path.join(DATA_DIR, 'data.sqlite')));

process.on('uncaughtException', (e) => log.error('uncaught', e));
process.on('unhandledRejection', (e) => log.error('unhandled rejection', e));
