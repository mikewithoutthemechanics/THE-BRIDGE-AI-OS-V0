// =============================================================================

// BRIDGE AI OS — Local Terminal Server
// Port: 5002
// Spawns local PTY shells via node-pty, streams to browser over WebSocket
// =============================================================================

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const pty = require('node-pty');
const jwt = require('jsonwebtoken');

const PORT = parseInt(process.env.TERMINAL_PROXY_PORT, 10) || 5002;
const MAX_SESSIONS = 10;
const HEARTBEAT_MS = 30000;

const shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const sessions = new Map();

// Parse cookies
function parseCookie(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {});
}

// ── CORS ──
const allowedOrigins = ['https://wall.bridge-ai-os.com', 'http://localhost:3000'];
app.use((req, res, next) => {
  if (!allowedOrigins.includes(req.headers.origin)) {
    return res.status(403).json({ error: 'Invalid origin' });
  }
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  next();
});

// ── Static files ──
app.use('/terminal', express.static(path.join(__dirname, 'Xpublic')));
app.get('/', (_req, res) => res.redirect('/terminal.html'));

// ── Health ──
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', sessions: sessions.size, max: MAX_SESSIONS });
});

// ── WebSocket handler ──
wss.on('connection', (clientWs, req) => {
  const cookies = parseCookie(req.headers.cookie);
  const token = cookies.access_token;
  if (!token) {
    clientWs.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
    clientWs.close();
    return;
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    clientWs.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
    clientWs.close();
    return;
  }

  if (sessions.size >= MAX_SESSIONS) {
    clientWs.send(JSON.stringify({ type: 'error', message: 'Max sessions reached' }));
    clientWs.close();
    return;
  }

  const sessionId = crypto.randomBytes(16).toString('hex');
  let alive = true;
  console.log(`[TERMINAL] New session: ${sessionId} from ${req.socket.remoteAddress}`);

  // Spawn local PTY
  let ptyProcess;
  try {
    ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME || process.env.USERPROFILE || '.',
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME || process.env.USERPROFILE,
        TERM: 'xterm-256color'
      },
    });
  } catch (error) {
    console.error(`Failed to spawn PTY: ${error.message}`);
    clientWs.send(JSON.stringify({ type: 'error', message: 'Failed to start terminal session' }));
    clientWs.close();
    return;
  }

  const session = { id: sessionId, clientWs, ptyProcess, createdAt: Date.now() };
  sessions.set(sessionId, session);

  // Send session info to client
  clientWs.send(JSON.stringify({ type: 'session', id: sessionId }));
  clientWs.send(JSON.stringify({ type: 'connected' }));

  // PTY -> Browser
  ptyProcess.onData((data) => {
    try {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data);
      }
    } catch (_) {}
  });

  ptyProcess.onExit(({ exitCode }) => {
    try {
      clientWs.send(JSON.stringify({ type: 'pty-closed', exitCode }));
    } catch (_) {}
    cleanup();
  });

  // Browser -> PTY
  clientWs.on('message', (msg) => {
    const str = typeof msg === 'string' ? msg : msg.toString();

    // Handle resize messages
    try {
      const parsed = JSON.parse(str);
      if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
        ptyProcess.resize(parsed.cols, parsed.rows);
        return;
      }
    } catch (_) {
      // Not JSON, treat as terminal input
    }

    if (str.length > 1024) return;
    // Sanitize input to prevent shell injection
    const sanitized = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    ptyProcess.write(sanitized);
  });

  // Heartbeat
  const heartbeat = setInterval(() => {
    if (!alive) {
      cleanup();
      return;
    }
    alive = false;
    try {
      clientWs.ping();
    } catch (_) {
      cleanup();
    }
  }, HEARTBEAT_MS);

  clientWs.on('pong', () => { alive = true; });

  // Cleanup
  function cleanup() {
    console.log(`[TERMINAL] Session ended: ${sessionId}`);
    clearInterval(heartbeat);
    sessions.delete(sessionId);
    try { ptyProcess.kill(); } catch (_) {}
    try { if (clientWs.readyState !== WebSocket.CLOSED) clientWs.close(); } catch (_) {}
  }

  clientWs.on('close', cleanup);
  clientWs.on('error', cleanup);
});

// ── Start ──
server.listen(PORT, () => {
  console.log(`[TERMINAL] Running on ws://localhost:${PORT}`);
  console.log(`[TERMINAL] Shell: ${shell}`);
  console.log(`[TERMINAL] Max sessions: ${MAX_SESSIONS}`);
});
