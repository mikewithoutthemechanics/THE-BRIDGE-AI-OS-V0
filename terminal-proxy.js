// =============================================================================
// BRIDGE AI OS — Secure Ops Terminal
// Port: 5002
// Whitelist-only command execution over authenticated WebSocket
// SECURITY: No PTY / no arbitrary shell — only pre-approved commands run
// =============================================================================

const express = require('express');
const http    = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const path = require('path');
const jwt  = require('jsonwebtoken');

const PORT         = parseInt(process.env.TERMINAL_PROXY_PORT, 10) || 5002;
const HEARTBEAT_MS = 30000;

// ── Allowed commands (exact match) ──────────────────────────────────────────
// Add entries here to expand permitted operations. Never interpolate user data.
const ALLOWED = {
  status: { cmd: 'uptime',             args: [], label: 'System Status' },
  logs:   { cmd: 'journalctl',         args: ['-n', '50', '--no-pager'], label: 'Recent Logs' },
  memory: { cmd: 'free',               args: ['-h'], label: 'Memory Usage' },
  disk:   { cmd: 'df',                 args: ['-h', '--output=source,size,used,avail,pcent'], label: 'Disk Usage' },
};

// ── CORS origins ─────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean)
  .concat(['https://wall.bridge-ai-os.com', 'http://localhost:3000']);

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

// ── CORS middleware ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden origin' });
  }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  next();
});

// ── Static: serve terminal HTML ──────────────────────────────────────────────
app.use('/terminal', express.static(path.join(__dirname, 'public')));
app.get('/',         (_req, res) => res.redirect('/terminal/terminal.html'));

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', mode: 'whitelist', commands: Object.keys(ALLOWED) });
});

// ── WebSocket ────────────────────────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  let authed = false;
  let alive  = true;

  // Heartbeat
  const hb = setInterval(() => {
    if (!alive) { ws.terminate(); return; }
    alive = false;
    ws.ping();
  }, HEARTBEAT_MS);
  ws.on('pong', () => { alive = true; });

  // Cleanup on close
  ws.on('close', () => clearInterval(hb));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Bad request' }));
      return;
    }

    // ── Auth ────────────────────────────────────────────────────────────────
    if (msg.type === 'auth') {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        ws.send(JSON.stringify({ type: 'error', message: 'Server misconfiguration' }));
        ws.close();
        return;
      }
      try {
        const decoded = jwt.verify(msg.token, secret);
        // TODO: Add Redis-backed token revocation check here.
        // e.g. if (await redis.sismember('revoked_tokens', decoded.jti)) { reject }
        // Required for logout / forced session invalidation.
        authed = true;
        ws.user = decoded;
        ws.send(JSON.stringify({
          type: 'init',
          commands: Object.entries(ALLOWED).map(([key, v]) => ({ key, label: v.label }))
        }));
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
        ws.close();
      }
      return;
    }

    if (!authed) {
      ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
      return;
    }

    // ── Exec (whitelist only) ────────────────────────────────────────────────
    if (msg.type === 'exec') {
      const entry = ALLOWED[msg.command];
      if (!entry) {
        ws.send(JSON.stringify({ type: 'error', message: 'Command not allowed' }));
        return;
      }

      ws.send(JSON.stringify({ type: 'output', data: `\r\n\x1b[36m▶ ${entry.label}\x1b[0m\r\n` }));

      const proc = spawn(entry.cmd, entry.args, { shell: false, timeout: 15000 });

      proc.stdout.on('data', d => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'output', data: d.toString() }));
        }
      });

      proc.stderr.on('data', d => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'output', data: '\x1b[33m' + d.toString() + '\x1b[0m' }));
        }
      });

      proc.on('error', (err) => {
        // journalctl not available on Windows — show helpful fallback
        const fallback = entry.cmd === 'journalctl'
          ? 'journalctl unavailable (Windows). Use: Get-EventLog -LogName Application -Newest 50'
          : err.message;
        ws.send(JSON.stringify({ type: 'error', message: fallback }));
      });

      proc.on('close', (code) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'done', code }));
        }
      });
    }
  });

  // Reject unauthenticated connections that never send auth within 10s
  const authTimeout = setTimeout(() => {
    if (!authed) {
      ws.send(JSON.stringify({ type: 'error', message: 'Auth timeout' }));
      ws.close();
    }
  }, 10000);
  ws.on('close', () => clearTimeout(authTimeout));
});

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[TERMINAL] Secure ops mode — ws://localhost:${PORT}`);
  console.log(`[TERMINAL] Allowed commands: ${Object.keys(ALLOWED).join(', ')}`);
});
