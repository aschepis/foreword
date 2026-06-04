import path from 'node:path';
import { DATA_DIR } from './db.js';
import { log, banner } from './log.js';
import { startServer } from './app.js';

/* Long-lived HTTP-server mode: bind the configured port (default 3200) and
   serve the API + UI + /mcp. For the on-demand stdio variant see
   server/mcp-stdio.js. */
startServer().then(({ port }) => {
  log.info('MCP server mounted at /mcp (stateless, per-request server)');
  banner(port, path.join(DATA_DIR, 'data.sqlite'));
});

process.on('uncaughtException', (e) => log.error('uncaught', e));
process.on('unhandledRejection', (e) => log.error('unhandled rejection', e));
