/**
 * Foreword MCP server.
 *
 * Mounts the Model Context Protocol over Streamable HTTP at /mcp on the
 * existing Express app. Stateless mode: a fresh McpServer + transport
 * pair per HTTP request, no session id. Our state lives in SQLite, so
 * the MCP layer never needs its own session tracking.
 *
 * The "fresh server per request" pattern is the canonical stateless
 * pattern from the SDK examples (simpleStatelessStreamableHttp.js).
 * Reusing one transport instance across requests breaks because the
 * transport tracks active streams per-call.
 */
import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  createReview,
  listComments,
  getFixableWork,
  markCommentFixed,
  waitForReviewSignal,
} from './tools.js';
import { log } from '../log.js';

const router = express.Router();

/* Wrap a tool fn so it always returns MCP-shaped content + handles errors.
   `extra.signal` is an AbortSignal that fires when the HTTP transport
   closes; we forward it as a second arg so long-running tools (notably
   wait_for_review_signal) can stop their work when the agent disconnects. */
function bind(name, impl) {
  return async (args, extra) => {
    try {
      const result = await impl(args || {}, extra?.signal);
      return {
        structuredContent: result,
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (e) {
      log.error(`MCP tool "${name}" failed`, e);
      return {
        isError: true,
        content: [{ type: 'text', text: e.message || String(e) }],
      };
    }
  };
}

/**
 * Build a fresh MCP server instance with all Foreword tools registered.
 * Called per HTTP request — registration is cheap (microseconds).
 */
function buildServer() {
  const mcp = new McpServer(
    { name: 'foreword', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  mcp.registerTool('create_review', {
    description:
      'Create a Foreword review for a diff range and optionally open it in the user\'s browser. ' +
      'Auto-registers the repo if Foreword does not yet know about it. Returns review_id, url, ' +
      'and an mcp_session_id used to identify this review as agent-initiated.',
    inputSchema: {
      repo_path:     z.string().describe('Absolute path to the git repository.'),
      head_ref:      z.string().describe('Branch or ref the user should review (e.g. "feat/x").'),
      base_ref:      z.string().optional().describe('Base ref to diff against (default: repo default branch).'),
      worktree_path: z.string().optional().describe('Override worktree path if different from repo_path.'),
      launch:        z.boolean().optional().describe('Open in the default browser. Default true.'),
    },
  }, bind('create_review', createReview));

  mcp.registerTool('list_comments', {
    description:
      'List comments on a Foreword review. filter narrows the result: "all", "fixable_pending" ' +
      '(agent-fixable comments not yet fixed), "human", or "agent_findings".',
    inputSchema: {
      review_id: z.number().describe('The Foreword review id.'),
      filter:    z.enum(['all', 'fixable_pending', 'human', 'agent_findings']).optional()
                  .describe('Default "all".'),
    },
  }, bind('list_comments', listComments));

  mcp.registerTool('get_fixable_work', {
    description:
      'Return the comments on a review that the user has flagged as agent-fixable and that ' +
      'have NOT yet been addressed. Each item includes thread_markdown — a pre-rendered ' +
      'conversation so you don\'t have to reconstruct parent_id chains.',
    inputSchema: { review_id: z.number() },
  }, bind('get_fixable_work', getFixableWork));

  mcp.registerTool('mark_comment_fixed', {
    description:
      'After applying a fix in code, mark the comment so future get_fixable_work calls skip it. ' +
      'commit_sha is recorded as audit trail in the UI.',
    inputSchema: {
      comment_id: z.number(),
      commit_sha: z.string().optional().describe('The commit that contains the fix.'),
      message:    z.string().optional().describe('Optional short note for the audit trail.'),
    },
  }, bind('mark_comment_fixed', markCommentFixed));

  mcp.registerTool('wait_for_review_signal', {
    description:
      'Block until the user clicks "Send to agent" in the Foreword UI. Long-polls server-side; ' +
      'returns with signaled=true on submit, or signaled=false on timeout (default 300s, max 600s). ' +
      'You can re-call after a timeout. The return summary tells you what shape the review is in.',
    inputSchema: {
      review_id:       z.number(),
      timeout_seconds: z.number().min(1).max(600).optional().describe('Default 300.'),
    },
  }, bind('wait_for_review_signal', waitForReviewSignal));

  return mcp;
}

/**
 * Per-request handler. Builds a fresh server + transport, hands the
 * request to the transport, and tears everything down on response close.
 */
async function handle(req, res) {
  const server = buildServer();
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    log.error('MCP request failed', e);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
}

router.post('/', handle);
/* GET/DELETE only make sense for stateful sessions; reject. */
router.get('/', (req, res) => res.status(405).json({
  jsonrpc: '2.0',
  error: { code: -32000, message: 'GET not supported in stateless mode' },
  id: null,
}));

export default router;
