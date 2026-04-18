#!/usr/bin/env node
// Orchestra dev proxy — serves orchestra.html + forwards /admin/* and /api/* to go.ai-os.co.za
// Zero dependencies (stdlib only). Usage:  node server.js [port]

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT   = Number(process.argv[2] || process.env.PORT || 7777);
const UPSTREAM_HOST = 'go.ai-os.co.za';
const ROOT   = __dirname;
const HTML   = path.join(ROOT, 'orchestra.html');
const ALLOWED_ORIGINS = new Set([
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
]);

function proxy(req, res){
  const opts = {
    host: UPSTREAM_HOST,
    port: 443,
    method: req.method,
    path: req.url,
    headers: {
      'host': UPSTREAM_HOST,
      'accept': req.headers.accept || 'application/json,*/*',
      'user-agent': 'orchestra-proxy/1.0',
    },
    timeout: 8000,
  };
  const up = https.request(opts, r => {
    const origin = req.headers.origin;
    const corsHeaders = ALLOWED_ORIGINS.has(origin)
      ? { 'access-control-allow-origin': origin, 'vary': 'Origin' }
      : {};
    res.writeHead(r.statusCode || 502, {
      ...r.headers,
      ...corsHeaders,
      'cache-control': 'no-store',
    });
    r.pipe(res);
  });
  up.on('timeout', () => up.destroy(new Error('upstream timeout')));
  up.on('error', err => {
    res.writeHead(502, {'content-type':'application/json'});
    res.end(JSON.stringify({ok:false, error:'upstream_unreachable', detail:String(err.message||err)}));
  });
  req.pipe(up);
}

function serveHtml(res){
  fs.readFile(HTML, (err, buf) => {
    if (err){ res.writeHead(500); return res.end('orchestra.html not found next to server.js'); }
    res.writeHead(200, {'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end(buf);
  });
}

http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/' || u === '/index.html' || u === '/orchestra') return serveHtml(res);
  if (u.startsWith('/admin') || u.startsWith('/api')) return proxy(req, res);
  if (u === '/healthz'){
    const ok = process.uptime() > 1 && PORT > 0 && !!UPSTREAM_HOST && fs.existsSync(HTML);
    res.writeHead(ok ? 200 : 500, {'content-type':'text/plain','cache-control':'no-store'});
    return res.end(ok ? 'ok' : 'fail');
  }
  if (u === '/favicon.ico'){ res.writeHead(204); return res.end(); }
  res.writeHead(404,{'content-type':'text/plain'}); res.end('not found: '+u);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`[orchestra] http://127.0.0.1:${PORT}/  →  proxying /admin /api to https://${UPSTREAM_HOST}`);
});
