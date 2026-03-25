'use strict';

const express    = require('express');
const http       = require('http');
const app        = express();
const PORT       = process.env.PORT || 5000;
const AUTH_PORT  = process.env.AUTH_PORT || 5001;

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// STATIC (frontend + dashboard)
app.use(express.static(__dirname + '/public'));

// ROOT
app.get('/', (req, res) => res.redirect('/onboarding.html'));

// ─── Auth Proxy ───────────────────────────────────────────────────────────────
// Forwards /api/auth/* and /api/referral/* to the auth service on port 5001

function proxyToAuth(req, res) {
  // Strip the /api prefix: /api/auth/login → /auth/login
  const authPath = req.path.replace(/^\/api/, '');

  const body = req.body ? JSON.stringify(req.body) : null;

  const options = {
    hostname: '127.0.0.1',
    port:     AUTH_PORT,
    path:     authPath,
    method:   req.method,
    headers: {
      'Content-Type': 'application/json',
      ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      // Forward auth headers
      ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode);
    // Forward content-type header
    if (proxyRes.headers['content-type']) {
      res.setHeader('Content-Type', proxyRes.headers['content-type']);
    }

    let data = '';
    proxyRes.on('data', chunk => { data += chunk; });
    proxyRes.on('end', () => {
      try {
        res.json(JSON.parse(data));
      } catch {
        res.send(data);
      }
    });
  });

  proxyReq.on('error', (err) => {
    console.error('[server] Auth proxy error:', err.message);
    res.status(502).json({ error: 'Auth service unavailable' });
  });

  // Set a timeout so clients don't hang forever
  proxyReq.setTimeout(5000, () => {
    proxyReq.destroy();
    res.status(504).json({ error: 'Auth service timeout' });
  });

  if (body) proxyReq.write(body);
  proxyReq.end();
}

// Auth routes
app.post('/api/auth/register', proxyToAuth);
app.post('/api/auth/login',    proxyToAuth);
app.post('/api/auth/logout',   proxyToAuth);
app.post('/api/auth/refresh',  proxyToAuth);
app.get('/api/auth/verify',    proxyToAuth);

// Referral routes
app.post('/api/referral/claim',   proxyToAuth);
app.post('/api/referral/create',  proxyToAuth);

// ─── ONESHOT FUNNEL ───────────────────────────────────────────────────────────

app.get('/go', (req, res) => res.redirect('/system-status-dashboard.html'));
app.use('/go/save.php', (req, res) => res.status(204).end());
app.use('/go/r.php', (req, res) => res.redirect('https://ai-os.co.za'));

// ─── Health / Status ──────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ status: 'OK', port: PORT }));

app.get('/api/status', (req, res) => {
  res.json({
    system: 'BRIDGE AI OS',
    port:   PORT,
    auth:   `http://localhost:${AUTH_PORT}`,
    routes: [
      '/',
      '/onboarding.html',
      '/system-status-dashboard.html',
      '/api/auth/register',
      '/api/auth/login',
      '/api/auth/logout',
      '/api/auth/refresh',
      '/api/auth/verify',
      '/api/referral/claim',
      '/api/referral/create',
      '/go',
      '/go/save.php',
      '/go/r.php',
    ],
  });
});

app.listen(PORT, () => console.log(`[server] UNIFIED RUNNING → http://localhost:${PORT}`));
