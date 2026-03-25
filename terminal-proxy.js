// =============================================================================
// BRIDGE AI OS — Terminal WebSocket Proxy
// Port: 5002
// Proxies browser WebSocket connections to Xcontainerx PTY server on port 3001
// =============================================================================

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');

const PORT = parseInt(process.env.TERMINAL_PROXY_PORT, 10) || 5002;
const PTY_HOST = process.env.PTY_HOST || 'localhost';
const PTY_PORT = parseInt(process.env.PTY_PORT, 10) || 3001;
const PTY_TOKEN = process.env.CONTAINERX_TOKEN || 'secure-token-change-me';
const MAX_SESSIONS = 10;
const HEARTBEAT_MS = 30000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const sessions = new Map();

// ── CORS ──
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

// ── Health ──
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', sessions: sessions.size, max: MAX_SESSIONS });
});

// ── WebSocket handler ──
wss.on('connection', (clientWs, req) => {
  if (sessions.size >= MAX_SESSIONS) {
    clientWs.send(JSON.stringify({ type: 'error', message: 'Max sessions reached' }));
    clientWs.close();
    return;
  }

  const sessionId = crypto.randomBytes(16).toString('hex');
  let ptyWs = null;
  let alive = true;

  // Connect to Xcontainerx PTY
  try {
    ptyWs = new WebSocket(`ws://${PTY_HOST}:${PTY_PORT}`, PTY_TOKEN);
  } catch (err) {
    clientWs.send(JSON.stringify({ type: 'error', message: 'Failed to connect to PTY server' }));
    clientWs.close();
    return;
  }

  const session = { id: sessionId, clientWs, ptyWs, createdAt: Date.now() };
  sessions.set(sessionId, session);

  // Send session info to client
  clientWs.send(JSON.stringify({ type: 'session', id: sessionId }));

  // PTY -> Browser
  ptyWs.on('message', (data) => {
    try {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data);
      }
    } catch (_) {}
  });

  ptyWs.on('open', () => {
    clientWs.send(JSON.stringify({ type: 'connected' }));
  });

  ptyWs.on('error', (err) => {
    try {
      clientWs.send(JSON.stringify({ type: 'error', message: 'PTY connection error' }));
    } catch (_) {}
    cleanup();
  });

  ptyWs.on('close', () => {
    try {
      clientWs.send(JSON.stringify({ type: 'pty-closed' }));
    } catch (_) {}
    cleanup();
  });

  // Browser -> PTY
  clientWs.on('message', (msg) => {
    const str = typeof msg === 'string' ? msg : msg.toString();
    if (str.length > 1024) return;

    if (ptyWs && ptyWs.readyState === WebSocket.OPEN) {
      ptyWs.send(str);
    }
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
    clearInterval(heartbeat);
    sessions.delete(sessionId);
    try { if (ptyWs && ptyWs.readyState !== WebSocket.CLOSED) ptyWs.close(); } catch (_) {}
    try { if (clientWs.readyState !== WebSocket.CLOSED) clientWs.close(); } catch (_) {}
  }

  clientWs.on('close', cleanup);
  clientWs.on('error', cleanup);
});

// ── Start ──
server.listen(PORT, () => {
  console.log(`[TERMINAL-PROXY] Running on ws://localhost:${PORT}`);
  console.log(`[TERMINAL-PROXY] Proxying to PTY server at ws://${PTY_HOST}:${PTY_PORT}`);
  console.log(`[TERMINAL-PROXY] Max sessions: ${MAX_SESSIONS}`);
});
