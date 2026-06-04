/**
 * Express app + server factory.
 *
 * Both entry points use this: server/index.js (the long-lived HTTP server
 * you `pnpm start`) and server/mcp-stdio.js (the on-demand server an agent
 * launches over stdio). Keeping the wiring here means the two modes serve
 * the exact same API, UI, and /mcp surface.
 */
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { requestLogger } from './log.js';

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
import { log } from './log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Build the fully-wired Express app (no listen). */
export function createApp() {
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

  return app;
}

/**
 * Build the app and start listening.
 *
 * @param {object}  [opts]
 * @param {number}  [opts.port]  Port to bind. Default: $PORT or 3200. Pass 0
 *   for an OS-assigned ephemeral port (used by stdio mode so it never
 *   collides with a persistent instance on 3200).
 * @returns {Promise<{app, server, port}>} resolves once listening; `port` is
 *   the actually-bound port. process.env.PORT is updated to it so
 *   publicBaseUrl() in mcp/tools.js returns correct review URLs.
 */
export function startServer({ port } = {}) {
  const app = createApp();
  const desired = port ?? parseInt(process.env.PORT || '3200', 10);
  return new Promise((resolve, reject) => {
    const server = app.listen(desired, () => {
      const actual = server.address().port;
      process.env.PORT = String(actual);
      resolve({ app, server, port: actual });
    });
    server.on('error', reject);
  });
}
