#!/usr/bin/env node
/**
 * On-demand (stdio) Foreword MCP server.
 *
 * Unlike the long-lived HTTP server (server/index.js), this entry point is
 * launched by the agent itself — e.g.
 *
 *   claude mcp add foreword -- node /abs/path/to/foreword/server/mcp-stdio.js
 *
 * It speaks MCP over stdio AND boots the Foreword web server in the same
 * process so the review opens in a browser without a separate `pnpm start`.
 * State lives in the shared SQLite DB, so the five tools behave identically
 * to HTTP mode. The web server lives for the whole agent session and dies
 * with this process when the agent closes the connection.
 *
 * IMPORTANT: stdout is reserved for the JSON-RPC protocol stream. The env
 * flag below makes the logger (server/log.js) write to stderr instead — set
 * it BEFORE importing anything that logs.
 */
process.env.FOREWORD_MCP_STDIO = '1';

import path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './mcp/index.js';
import { startServer } from './app.js';
import { DATA_DIR } from './db.js';
import { log } from './log.js';

async function main() {
  /* Ephemeral port by default (0 → OS-assigned) so we never collide with a
     persistent instance already holding 3200. Honor $PORT if the user set
     one. startServer() writes the resolved port back to process.env.PORT so
     review URLs point at the right place. */
  const { port } = await startServer({ port: Number(process.env.PORT) || 0 });
  log.info(`foreword stdio MCP: web server on http://localhost:${port}  db=${path.join(DATA_DIR, 'data.sqlite')}`);

  const mcp = buildServer();
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  log.info('foreword stdio MCP: connected, awaiting tool calls');
}

main().catch((e) => {
  log.error('stdio MCP failed to start', e);
  process.exit(1);
});

process.on('uncaughtException', (e) => log.error('uncaught', e));
process.on('unhandledRejection', (e) => log.error('unhandled rejection', e));
