#!/usr/bin/env node
// Orchestra dev proxy — serves orchestra.html + forwards /admin/* and /api/* to go.ai-os.co.za
// Zero dependencies (stdlib only). Usage:  node server.js [port]
//
// Env knobs (all optional):
//   ORCHESTRA_ADMIN_TOKEN  — if set, /admin/* requires "Authorization: Bearer <token>"
//   ORCHESTRA_RATE_LIMIT   — requests / 60s per IP for /admin + /api (default 60, 0 disables)
//   ORCHESTRA_ALLOW_IFRAME — "1" to drop X-Frame-Options (default: DENY)

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT   = Number(process.argv[2] || process.env.PORT || 7777);
const UPSTREAM_HOST = 'go.ai-os.co.za';
const ROOT   = __dirname;
const HTML   = path.join(ROOT, 'orchestra.html');
const BOOT_TS = Date.now();
const ADMIN_TOKEN = process.env.ORCHESTRA_ADMIN_TOKEN || '';
const RATE_LIMIT  = Number(process.env.ORCHESTRA_RATE_LIMIT ?? 60);
const ALLOW_IFRAME = process.env.ORCHESTRA_ALLOW_IFRAME === '1';

const ALLOWED_ORIGINS = new Set([
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
]);

// --- Hardening headers applied to every response (proxy + static + healthz) ---
const HARDENING_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'geolocation=(), microphone=(), camera=(), payment=()',
  ...(ALLOW_IFRAME ? {} : {'x-frame-options': 'DENY'}),
};

// --- Simple in-memory rate limiter: sliding 60s window per IP ---
const rlWindow = 60_000;
const rlBuckets = new Map(); // ip -> { start, count }
function rateLimited(ip){
  if (RATE_LIMIT <= 0) return false;
  const now = Date.now();
  let b = rlBuckets.get(ip);
  if (!b || now - b.start > rlWindow){
    b = {start: now, count: 0};
    rlBuckets.set(ip, b);
  }
  b.count++;
  return b.count > RATE_LIMIT;
}
// Periodic prune to keep memory bounded
setInterval(() => {
  const cutoff = Date.now() - rlWindow * 2;
  for (const [ip, b] of rlBuckets) if (b.start < cutoff) rlBuckets.delete(ip);
}, rlWindow).unref();

function clientIp(req){
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

// --- Cookie rewriter: strip Domain, force SameSite=None; Secure so upstream
//     cookies survive the proxy hop without leaking beyond this origin. ---
function rewriteCookies(setCookie){
  if (!setCookie) return setCookie;
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  return list.map(c => {
    let out = c.replace(/;\s*Domain=[^;]+/gi, '');
    if (!/;\s*SameSite=/i.test(out)) out += '; SameSite=None';
    else out = out.replace(/;\s*SameSite=[^;]+/gi, '; SameSite=None');
    if (!/;\s*Secure/i.test(out)) out += '; Secure';
    return out;
  });
}

function proxy(req, res){
  // Auth gate — only if operator has opted in via env
  if (ADMIN_TOKEN && req.url.startsWith('/admin')){
    const hdr = req.headers.authorization || '';
    if (hdr !== `Bearer ${ADMIN_TOKEN}`){
      res.writeHead(401, {...HARDENING_HEADERS,'content-type':'application/json','www-authenticate':'Bearer'});
      return res.end(JSON.stringify({ok:false, error:'admin_auth_required'}));
    }
  }
  if (rateLimited(clientIp(req))){
    res.writeHead(429, {...HARDENING_HEADERS,'content-type':'application/json','retry-after':'60'});
    return res.end(JSON.stringify({ok:false, error:'rate_limited'}));
  }

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
    const headers = {
      ...r.headers,
      ...corsHeaders,
      ...HARDENING_HEADERS,
      'cache-control': 'no-store',
    };
    if (r.headers['set-cookie']) headers['set-cookie'] = rewriteCookies(r.headers['set-cookie']);
    res.writeHead(r.statusCode || 502, headers);
    r.pipe(res);
  });
  up.on('timeout', () => up.destroy(new Error('upstream timeout')));
  up.on('error', err => {
    res.writeHead(502, {...HARDENING_HEADERS,'content-type':'application/json'});
    res.end(JSON.stringify({ok:false, error:'upstream_unreachable', detail:String(err.message||err)}));
  });
  req.pipe(up);
}

function serveHtml(res){
  fs.readFile(HTML, (err, buf) => {
    if (err){
      res.writeHead(500, HARDENING_HEADERS);
      return res.end('orchestra.html not found next to server.js');
    }
    res.writeHead(200, {...HARDENING_HEADERS,'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end(buf);
  });
}

function healthz(res){
  const ok = process.uptime() > 1 && PORT > 0 && !!UPSTREAM_HOST && fs.existsSync(HTML);
  const body = JSON.stringify({
    status: ok ? 'ok' : 'fail',
    uptime_s: Math.round(process.uptime()),
    boot_ts: BOOT_TS,
    ts: Date.now(),
    port: PORT,
    upstream: UPSTREAM_HOST,
    html_present: fs.existsSync(HTML),
    admin_gated: !!ADMIN_TOKEN,
    rate_limit: RATE_LIMIT,
  });
  res.writeHead(ok ? 200 : 500, {
    ...HARDENING_HEADERS,
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  res.end(body);
}

http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/' || u === '/index.html' || u === '/orchestra') return serveHtml(res);
  if (u === '/healthz') return healthz(res);
  if (u.startsWith('/admin') || u.startsWith('/api')) return proxy(req, res);
  if (u === '/favicon.ico'){ res.writeHead(204, HARDENING_HEADERS); return res.end(); }
  res.writeHead(404, {...HARDENING_HEADERS,'content-type':'text/plain'});
  res.end('not found: '+u);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`[orchestra] http://127.0.0.1:${PORT}/  →  proxying /admin /api to https://${UPSTREAM_HOST}`);
  console.log(`[orchestra] admin_gated=${!!ADMIN_TOKEN} rate_limit=${RATE_LIMIT}/60s iframe=${ALLOW_IFRAME?'allow':'deny'}`);
});
