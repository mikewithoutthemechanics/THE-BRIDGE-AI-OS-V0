const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ==========================================
// SECURITY CONFIG
// ==========================================

const ALLOWED_ENV = ['PATH', 'HOME', 'TERM'];
const AUTH_TOKEN = process.env.CONTAINERX_TOKEN || "secure-token-change-me";
const MAX_SESSIONS = 50;

let activeSessions = new Map();

// ==========================================
// SANITIZE ENV (CX-003)
// ==========================================

function getSafeEnv() {
  const safe = {};
  ALLOWED_ENV.forEach(k => {
    if (process.env[k]) safe[k] = process.env[k];
  });
  return safe;
}

// ==========================================
// AUTH (CX-002)
// ==========================================

function authenticate(req) {
  const token = req.headers['sec-websocket-protocol'];
  return token === AUTH_TOKEN;
}

// ==========================================
// SESSION ID
// ==========================================

function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

// ==========================================
// STATIC UI
// ==========================================

app.use(express.static(__dirname + '/public'));

// ==========================================
// WEBSOCKET HANDLER (HARDENED)
// ==========================================

wss.on('connection', function (ws, req) {

  // AUTH CHECK
  if (!authenticate(req)) {
    ws.close();
    return;
  }

  // LIMIT SESSIONS
  if (activeSessions.size >= MAX_SESSIONS) {
    ws.close();
    return;
  }

  const sessionId = generateSessionId();
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 120,
    rows: 30,
    cwd: process.env.HOME || '/',
    env: getSafeEnv()
  });

  activeSessions.set(sessionId, ptyProcess);

  // OUTPUT
  ptyProcess.on('data', (data) => {
    try {
      ws.send(data);
    } catch (e) {}
  });

  // INPUT (SANITIZED)
  ws.on('message', (msg) => {
    if (typeof msg !== 'string') return;

    // basic input length limit
    if (msg.length > 1024) return;

    try {
      ptyProcess.write(msg);
    } catch (e) {}
  });

  // ==========================================
  // CLEANUP (CX-001)
  // ==========================================

  const cleanup = () => {
    try {
      if (ptyProcess) {
        ptyProcess.kill();
      }
    } catch (e) {}

    activeSessions.delete(sessionId);
  };

  ws.on('close', cleanup);
  ws.on('error', cleanup);

  ptyProcess.on('exit', cleanup);
});

// ==========================================
// HEALTH ENDPOINT (NEW)
// ==========================================

app.get('/health', (req, res) => {
  res.json({
    status: "ok",
    sessions: activeSessions.size
  });
});

// ==========================================
// START SERVER
// ==========================================

server.listen(3000, () => {
  console.log('ContainerX Hardened running on http://localhost:3000');
});
