// lib/mcp-routes.js
// MCP (Model Context Protocol) Streamable HTTP adapter for aoe-unified.
// Spec: https://modelcontextprotocol.io  protocolVersion: 2025-06-18
//
// Exposes read-only tools to any MCP client (OpenAI Responses API, Claude, etc.)
// authenticated with MCP_BEARER_TOKEN. Mount BEFORE the /api/* BRAIN catch-all.

const crypto = require('crypto');
const axios = require('axios');

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'bridgeai-mcp', version: '0.1.0' };

const TOOLS = [
  {
    name: 'system_status',
    description: 'Returns aoe-unified server process status (uptime, node version, pid, env).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'brain_health',
    description: 'Checks the BRAIN orchestrator /api/health on localhost:8000 and returns the payload.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'list_capabilities',
    description: 'Lists which domains this MCP server currently introspects. Use before requesting access to a new tool.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
];

async function callTool(name /* , args */) {
  switch (name) {
    case 'system_status':
      return {
        uptime_seconds: Math.round(process.uptime()),
        node: process.version,
        pid: process.pid,
        env: process.env.NODE_ENV || 'production'
      };
    case 'brain_health':
      try {
        const resp = await axios.get('http://localhost:8000/api/health', { timeout: 3000 });
        return { status: 'up', http: resp.status, data: resp.data };
      } catch (e) {
        return { status: 'down', error: e.message };
      }
    case 'list_capabilities':
      return {
        read_tools: ['system_status', 'brain_health'],
        write_tools: [],
        note: 'Read-only surface. Write tools will be added after auth hardening review.'
      };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function verifyBearer(req) {
  const expected = process.env.MCP_BEARER_TOKEN;
  if (!expected) return { ok: false, reason: 'server-not-configured' };
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return { ok: false, reason: 'missing-bearer' };
  const given = Buffer.from(match[1]);
  const want = Buffer.from(expected);
  if (given.length !== want.length) return { ok: false, reason: 'bad-token' };
  if (!crypto.timingSafeEqual(given, want)) return { ok: false, reason: 'bad-token' };
  return { ok: true };
}

function rpcError(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return { jsonrpc: '2.0', id: id ?? null, error: err };
}
function rpcOk(id, result) {
  return { jsonrpc: '2.0', id, result };
}

async function handleRpc(msg) {
  if (!msg || typeof msg !== 'object') return rpcError(null, -32600, 'Invalid Request');
  const { id, method, params } = msg;
  const isNotification = id === undefined;
  if (typeof method !== 'string') return isNotification ? null : rpcError(id, -32600, 'Invalid Request');

  switch (method) {
    case 'initialize':
      return rpcOk(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO
      });

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;

    case 'ping':
      return rpcOk(id, {});

    case 'tools/list':
      return rpcOk(id, { tools: TOOLS });

    case 'tools/call': {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      if (!name) return rpcError(id, -32602, 'Missing tool name');
      try {
        const data = await callTool(name, args);
        return rpcOk(id, {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          isError: false
        });
      } catch (e) {
        return rpcOk(id, {
          content: [{ type: 'text', text: `Error: ${e.message}` }],
          isError: true
        });
      }
    }

    default:
      return isNotification ? null : rpcError(id, -32601, `Method not found: ${method}`);
  }
}

function registerMcpRoutes(app) {
  app.post('/mcp', async (req, res) => {
    const auth = verifyBearer(req);
    if (!auth.ok) {
      return res.status(401).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32000, message: 'Unauthorized', data: { reason: auth.reason } }
      });
    }

    const body = req.body;
    if (Array.isArray(body)) {
      const out = [];
      for (const m of body) {
        const r = await handleRpc(m);
        if (r) out.push(r);
      }
      return out.length === 0 ? res.status(202).end() : res.json(out);
    }

    const result = await handleRpc(body);
    if (result === null) return res.status(202).end();
    return res.json(result);
  });

  app.get('/mcp', (req, res) => {
    res.status(405).json({ error: 'SSE transport not enabled. Use POST with JSON-RPC 2.0.' });
  });
}

module.exports = { registerMcpRoutes, TOOLS, PROTOCOL_VERSION };
