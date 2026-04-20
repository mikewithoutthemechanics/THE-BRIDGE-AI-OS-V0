#!/usr/bin/env node
// Orchestra dev proxy — serves orchestra.html + forwards /admin/* and /api/* to go.ai-os.co.za
// Zero dependencies (stdlib only). Usage:  node server.js [port]
//
// Env knobs (all optional):
//   ORCHESTRA_ADMIN_TOKEN   — if set, /admin/* requires "Authorization: Bearer <token>"
//   ORCHESTRA_RATE_LIMIT    — requests / 60s per IP for /admin + /api (default 60, 0 disables)
//   ORCHESTRA_ALLOW_IFRAME  — "1" to drop X-Frame-Options (default: DENY)
//   ORCHESTRA_COOKIE_SECURE — "1" to force "; Secure" on forwarded cookies (default: 0).
//                             Browsers drop Secure cookies on non-HTTPS, so leave this off
//                             when running behind plain-HTTP localhost. Set to 1 in prod.

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const session = require('./lib/session');

const PORT   = Number(process.argv[2] || process.env.PORT || 7777);
const UPSTREAM_HOST = 'go.ai-os.co.za';
const ROOT   = __dirname;
const HTML   = path.join(ROOT, 'orchestra.html');
const PUBLIC_DIR = path.join(ROOT, 'public');
const BOOT_TS = Date.now();
const ADMIN_TOKEN = process.env.ORCHESTRA_ADMIN_TOKEN || '';
const RATE_LIMIT  = Number(process.env.ORCHESTRA_RATE_LIMIT ?? 60);
const ALLOW_IFRAME = process.env.ORCHESTRA_ALLOW_IFRAME === '1';
const COOKIE_SECURE = process.env.ORCHESTRA_COOKIE_SECURE === '1';
const ADVISOR_SECRET = process.env.ADVISOR_SHARED_SECRET || '';
const ADVISOR_PORT   = parseInt(process.env.ADVISOR_PORT || '4721', 10);

// Settings system — stdlib http handler for /settings/* (see routes/settings.js).
// Created once at boot and re-used across requests.
const settingsRouter = require('./routes/settings').createRouter({
  adminToken:    ADMIN_TOKEN,
  advisorSecret: ADVISOR_SECRET,
  advisorPort:   ADVISOR_PORT,
});

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

// --- Cookie rewriter: strip Domain, normalize SameSite, conditionally force Secure.
//     SameSite=None requires Secure per spec, so in dev-HTTP mode we downgrade to
//     SameSite=Lax. This keeps cookies reaching the browser on plain-HTTP localhost
//     (Secure cookies are silently dropped by browsers over http://). ---
function rewriteCookies(setCookie){
  if (!setCookie) return setCookie;
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  const sameSite = COOKIE_SECURE ? 'None' : 'Lax';
  return list.map(c => {
    let out = c.replace(/;\s*Domain=[^;]+/gi, '');
    if (!/;\s*SameSite=/i.test(out)) out += `; SameSite=${sameSite}`;
    else out = out.replace(/;\s*SameSite=[^;]+/gi, `; SameSite=${sameSite}`);
    if (COOKIE_SECURE && !/;\s*Secure/i.test(out)) out += '; Secure';
    return out;
  });
}

function proxy(req, res){
  // Auth gate — cookie-based session only (zero-trust: no bearer fallback).
  // /admin/* is gated when ORCHESTRA_ADMIN_TOKEN is set. A valid signed
  // session cookie (issued by POST /settings/session) grants access.
  if (ADMIN_TOKEN && req.url.startsWith('/admin')){
    const s = session.verifySession(req, ADMIN_TOKEN);
    if (!s){
      res.writeHead(401, {...HARDENING_HEADERS,'content-type':'application/json'});
      return res.end(JSON.stringify({ok:false, error:'session_required', login:'/settings/admin?auth=expired'}));
    }
    // state-changing /admin calls also require the double-submit CSRF token
    if (req.method !== 'GET' && req.method !== 'HEAD' && !session.verifyCsrf(req)){
      res.writeHead(403, {...HARDENING_HEADERS,'content-type':'application/json'});
      return res.end(JSON.stringify({ok:false, error:'csrf_token_required'}));
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

// --- Static file server scoped to /public/*. Enforces path containment so
//     a crafted "..%2f" request can't escape the public directory.
const MIME = {
  '.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json',
  '.svg':'image/svg+xml',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.ico':'image/x-icon',
  '.html':'text/html; charset=utf-8',
};
function servePublic(u, res){
  const rel = decodeURIComponent(u.replace(/^\/public\//, ''));
  const abs = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!abs.startsWith(PUBLIC_DIR)){
    res.writeHead(403, {...HARDENING_HEADERS,'content-type':'text/plain'});
    return res.end('forbidden');
  }
  fs.readFile(abs, (err, buf) => {
    if (err){
      res.writeHead(404, {...HARDENING_HEADERS,'content-type':'text/plain'});
      return res.end('not found: '+u);
    }
    const ct = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {...HARDENING_HEADERS,'content-type':ct,'cache-control':'public, max-age=300'});
    res.end(buf);
  });
}

// --- Admin dashboard HTML (settings-admin.html is served by the settings router)
function serveAdminDashboard(res){
  const p = path.join(ROOT, 'admin-dashboard.html');
  fs.readFile(p, (err, buf) => {
    if (err){
      res.writeHead(500, HARDENING_HEADERS);
      return res.end('admin-dashboard.html not found');
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
  if (u === '/admin-dashboard' || u === '/admin-dashboard.html') return serveAdminDashboard(res);
  if (u === '/affiliate/dashboard' || u === '/affiliate/dashboard.html'){
    const affiliatePath = path.join(ROOT, '../affiliate-portal/dashboard.html');
    fs.readFile(affiliatePath, (err, buf) => {
      if (err){
        res.writeHead(500, HARDENING_HEADERS);
        return res.end('affiliate dashboard not found');
      }
      res.writeHead(200, {...HARDENING_HEADERS,'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
      res.end(buf);
    });
    return;
  }

  // Settings system — handles /settings/*, including GET /settings/admin (HTML dashboard).
  // Mounted BEFORE the /admin proxy so it doesn't get forwarded upstream.
  if (u.startsWith('/settings')){
    Promise.resolve(settingsRouter.handle(req, res)).catch(err => {
      if (!res.headersSent){
        res.writeHead(500, {...HARDENING_HEADERS,'content-type':'application/json'});
        res.end(JSON.stringify({error:'settings_handler_failed', detail:String(err.message||err)}));
      }
    });
    return;
  }
  if (u.startsWith('/public/')) return servePublic(u, res);

  // /api/affiliate/* and /ref/* — proxied to backend (real DB-backed handlers)
  if (u.startsWith('/api')) return proxy(req, res);
  if (u === '/favicon.ico'){ res.writeHead(204, HARDENING_HEADERS); return res.end(); }
  res.writeHead(404, {...HARDENING_HEADERS,'content-type':'text/plain'});
  res.end('not found: '+u);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`[orchestra] http://127.0.0.1:${PORT}/  →  proxying /admin /api to https://${UPSTREAM_HOST}`);
  console.log(`[orchestra] admin_gated=${!!ADMIN_TOKEN} rate_limit=${RATE_LIMIT}/60s iframe=${ALLOW_IFRAME?'allow':'deny'}`);
  console.log(`[settings]  mounted at /settings/* (admin UI: /settings/admin)`);
});
