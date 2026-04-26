'use strict';
/**
 * Bridge AI OS — MCP Status Dashboard Server
 * Polls each MCP container health endpoint and exposes:
 *   GET /api/mcp/status  — JSON summary of all services
 *   GET /               — HTML status board
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = parseInt(process.env.PORT || '3000', 10);
const SECRET = process.env.MCP_SECRET_KEY || '';

const SERVICES = [
  { name: 'Filesystem MCP', key: 'filesystem', url: process.env.MCP_FILESYSTEM_URL || 'http://mcp-filesystem:8080', port: 8080 },
  { name: 'GitHub MCP',     key: 'github',     url: process.env.MCP_GITHUB_URL    || 'http://mcp-github:8081',     port: 8081 },
  { name: 'Slack MCP',      key: 'slack',      url: process.env.MCP_SLACK_URL     || 'http://mcp-slack:8082',      port: 8082 },
  { name: 'Database MCP',   key: 'database',   url: process.env.MCP_DATABASE_URL  || 'http://mcp-database:8083',   port: 8083 },
  { name: 'Search MCP',     key: 'search',     url: process.env.MCP_SEARCH_URL    || 'http://mcp-search:8084',     port: 8084 },
];

// ── helpers ──────────────────────────────────────────────────────────────────

function httpGet(rawUrl, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const u = new URL(rawUrl);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get({ hostname: u.hostname, port: u.port || 80, path: u.pathname || '/', timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ ok: res.statusCode < 400, status: res.statusCode, body }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, body: 'timeout' }); });
    req.on('error', (e) => resolve({ ok: false, status: 0, body: e.message }));
  });
}

async function pollServices() {
  const results = await Promise.all(
    SERVICES.map(async (svc) => {
      const start = Date.now();
      const res = await httpGet(svc.url + '/health');
      return {
        ...svc,
        alive: res.ok || res.status === 404, // 404 means server is up but no /health route
        latency: Date.now() - start,
        httpStatus: res.status,
        checkedAt: new Date().toISOString(),
      };
    })
  );
  return results;
}

// ── HTML ─────────────────────────────────────────────────────────────────────

function buildHtml(services) {
  const rows = services.map((s) => {
    const dot  = s.alive ? '🟢' : '🔴';
    const lat  = s.alive ? `${s.latency}ms` : '—';
    const stat = s.httpStatus || 'ERR';
    return `
      <tr>
        <td>${dot}</td>
        <td><strong>${s.name}</strong></td>
        <td><code>:${s.port}</code></td>
        <td>${stat}</td>
        <td>${lat}</td>
        <td>${s.checkedAt.replace('T', ' ').slice(0, 19)}</td>
      </tr>`;
  }).join('');

  const up   = services.filter((s) => s.alive).length;
  const down = services.length - up;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bridge AI OS — MCP Status</title>
<meta http-equiv="refresh" content="15">
<style>
  body { background:#0a0c10; color:#e2e8f0; font-family:system-ui,sans-serif; padding:2rem; }
  h1   { color:#00d4ff; margin-bottom:.25rem; }
  p    { color:#8099b0; margin-bottom:2rem; font-size:.875rem; }
  table{ border-collapse:collapse; width:100%; max-width:760px; }
  th   { text-align:left; color:#8099b0; font-size:.75rem; letter-spacing:.05em; text-transform:uppercase; padding:.5rem .75rem; border-bottom:1px solid #1e2533; }
  td   { padding:.5rem .75rem; border-bottom:1px solid #111827; font-size:.875rem; }
  code { background:#1a1f2e; padding:.1rem .4rem; border-radius:4px; font-size:.8rem; }
  .badge { display:inline-block; padding:.2rem .7rem; border-radius:99px; font-size:.75rem; font-weight:600; }
  .up   { background:#052e16; color:#22c55e; }
  .down { background:#450a0a; color:#ef4444; }
  footer{ margin-top:2rem; font-size:.75rem; color:#4a5568; }
</style>
</head>
<body>
<h1>🛠 MCP Server Status</h1>
<p>Bridge AI OS · auto-refreshes every 15s · ${new Date().toUTCString()}</p>
<p>
  <span class="badge up">${up} UP</span>&nbsp;
  <span class="badge down">${down} DOWN</span>
</p>
<table>
  <thead>
    <tr>
      <th></th><th>Service</th><th>Port</th><th>HTTP</th><th>Latency</th><th>Last Check</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<footer>
  Dashboard at :${PORT} | Secrets auth: ${SECRET ? '✓ configured' : '✗ missing MCP_SECRET_KEY'}
</footer>
</body>
</html>`;
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/api/mcp/status') {
    const services = await pollServices();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true, services, ts: new Date().toISOString() }, null, 2));
    return;
  }

  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Default: HTML dashboard
  const services = await pollServices();
  const html = buildHtml(services);
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

server.listen(PORT, () => {
  console.log(`[mcp-dashboard] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[mcp-dashboard] Monitoring ${SERVICES.length} MCP services`);
});
