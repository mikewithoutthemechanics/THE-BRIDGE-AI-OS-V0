'use strict';
/**
 * tests/system.test.js
 * Agent-6A — Tests for system.js endpoints
 *
 * system.js uses plain http (not Express) and boots itself when required.
 * We spawn it as a child process on a free port and make real HTTP requests.
 */

jest.setTimeout(60000);

const { spawn }  = require('child_process');
const http       = require('http');
const path       = require('path');
const net        = require('net');

// ── Port helper ───────────────────────────────────────────────────────────────

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

function httpGet(port, urlPath, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      headers: extraHeaders,
    };
    http.get(opts, (res) => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body), headers: res.headers });
        } catch (_) {
          resolve({ status: res.statusCode, body, headers: res.headers });
        }
      });
    }).on('error', reject);
  });
}

// ── Wait for server ready ─────────────────────────────────────────────────────

function waitReady(port, retries = 30, delay = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    function attempt() {
      attempts++;
      const sock = net.createConnection({ host: '127.0.0.1', port });
      sock.on('connect', () => { sock.destroy(); resolve(); });
      sock.on('error', () => {
        if (attempts >= retries) return reject(new Error(`system.js not ready on :${port} after ${attempts} attempts`));
        setTimeout(attempt, delay);
      });
    }
    attempt();
  });
}

// ── Process lifecycle ─────────────────────────────────────────────────────────

let systemProc, systemPort, authToken;

// Generate a test JWT for authenticated API requests
const jwt = require('jsonwebtoken');
const TEST_JWT_SECRET = process.env.JWT_SECRET || 'aoe-unified-super-secret-change-in-prod';

beforeAll(async () => {
  authToken = jwt.sign({ sub: 'test_user', email: 'test@system.test' }, TEST_JWT_SECRET, { expiresIn: '1h' });
  systemPort = await findFreePort();

  systemProc = spawn(
    process.execPath,
    [path.join(__dirname, '..', 'system.js')],
    {
      env: { ...process.env, PORT: String(systemPort), NODE_ENV: 'test', JWT_SECRET: TEST_JWT_SECRET },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  // Suppress output in test runs
  systemProc.stdout.on('data', () => {});
  systemProc.stderr.on('data', () => {});

  await waitReady(systemPort);
});

afterAll(() => {
  if (systemProc) {
    systemProc.kill('SIGTERM');
  }
});

// ── GET /health ───────────────────────────────────────────────────────────────

describe('system.js GET /health', () => {
  test('returns 200', async () => {
    const res = await httpGet(systemPort, '/health');
    expect(res.status).toBe(200);
  });

  test('body.status is ok', async () => {
    const res = await httpGet(systemPort, '/health');
    expect(res.body.status).toBe('ok');
  });

  test('body has port field', async () => {
    const res = await httpGet(systemPort, '/health');
    expect(typeof res.body.port).toBe('number');
  });

  test('body has uptime as number', async () => {
    const res = await httpGet(systemPort, '/health');
    expect(typeof res.body.uptime).toBe('number');
  });

  test('body has ts as number', async () => {
    const res = await httpGet(systemPort, '/health');
    expect(typeof res.body.ts).toBe('number');
  });

  test('CORS header reflects allowed origin', async () => {
    const res = await httpGet(systemPort, '/health', { Origin: 'http://localhost:3000' });
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  test('CORS header absent for unknown origin', async () => {
    const res = await httpGet(systemPort, '/health', { Origin: 'https://evil.example.com' });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

// Helper: authenticated API GET
function apiGet(urlPath) {
  return httpGet(systemPort, urlPath, { Authorization: `Bearer ${authToken}` });
}

// ── GET /api/full ─────────────────────────────────────────────────────────────

describe('system.js GET /api/full', () => {
  test('returns 200', async () => {
    const res = await apiGet('/api/full');
    expect(res.status).toBe(200);
  });

  test('body has sys object', async () => {
    const res = await apiGet('/api/full');
    expect(typeof res.body.sys).toBe('object');
  });

  test('body has engines array', async () => {
    const res = await apiGet('/api/full');
    expect(Array.isArray(res.body.engines)).toBe(true);
  });

  test('body has recommendations array', async () => {
    const res = await apiGet('/api/full');
    expect(Array.isArray(res.body.recommendations)).toBe(true);
  });

  test('body has ts', async () => {
    const res = await apiGet('/api/full');
    expect(typeof res.body.ts).toBe('number');
  });
});

// ── GET /api/scan ─────────────────────────────────────────────────────────────

describe('system.js GET /api/scan', () => {
  test('returns 200', async () => {
    const res = await apiGet('/api/scan');
    expect(res.status).toBe(200);
  });

  test('body has engines array', async () => {
    const res = await apiGet('/api/scan');
    expect(Array.isArray(res.body.engines)).toBe(true);
  });

  test('body has sys.hostname', async () => {
    const res = await apiGet('/api/scan');
    expect(typeof res.body.sys.hostname).toBe('string');
  });
});

// ── GET /api/engines ──────────────────────────────────────────────────────────

describe('system.js GET /api/engines', () => {
  test('returns 200', async () => {
    const res = await apiGet('/api/engines');
    expect(res.status).toBe(200);
  });

  test('body is an array', async () => {
    const res = await apiGet('/api/engines');
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('each engine has name and status', async () => {
    const res = await apiGet('/api/engines');
    expect(res.body.length).toBeGreaterThan(0);
    res.body.forEach(e => {
      expect(typeof e.name).toBe('string');
      expect(typeof e.status).toBe('string');
    });
  });

  test('each engine has type and eco_impact', async () => {
    const res = await apiGet('/api/engines');
    res.body.forEach(e => {
      expect(typeof e.type).toBe('string');
      expect(typeof e.eco_impact).toBe('number');
    });
  });
});

// ── GET /api/economic ─────────────────────────────────────────────────────────

describe('system.js GET /api/economic', () => {
  test('returns 200', async () => {
    const res = await apiGet('/api/economic');
    expect(res.status).toBe(200);
  });

  test('body has streams array', async () => {
    const res = await apiGet('/api/economic');
    expect(Array.isArray(res.body.streams)).toBe(true);
  });

  test('body has costs array', async () => {
    const res = await apiGet('/api/economic');
    expect(Array.isArray(res.body.costs)).toBe(true);
  });

  test('body has summary with net_flow', async () => {
    const res = await apiGet('/api/economic');
    expect(typeof res.body.summary).toBe('object');
    expect(typeof res.body.summary.net_flow).toBe('number');
  });
});

// ── GET /api/recommendations ──────────────────────────────────────────────────

describe('system.js GET /api/recommendations', () => {
  test('returns 200', async () => {
    const res = await apiGet('/api/recommendations');
    expect(res.status).toBe(200);
  });

  test('body is an array', async () => {
    const res = await apiGet('/api/recommendations');
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('each recommendation has category, priority, title', async () => {
    const res = await apiGet('/api/recommendations');
    expect(res.body.length).toBeGreaterThan(0);
    res.body.forEach(r => {
      expect(typeof r.category).toBe('string');
      expect(typeof r.priority).toBe('string');
      expect(typeof r.title).toBe('string');
    });
  });
});

// ── GET /api/logs ─────────────────────────────────────────────────────────────

describe('system.js GET /api/logs', () => {
  test('returns 200', async () => {
    const res = await apiGet('/api/logs');
    expect(res.status).toBe(200);
  });

  test('body is an array', async () => {
    const res = await apiGet('/api/logs');
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('log entries have level, category, msg', async () => {
    const res = await apiGet('/api/logs');
    if (res.body.length > 0) {
      const entry = res.body[0];
      expect(entry.level).toBeDefined();
      expect(entry.category).toBeDefined();
      expect(entry.msg).toBeDefined();
    }
  });
});

// ── GET /api/metrics ──────────────────────────────────────────────────────────

describe('system.js GET /api/metrics', () => {
  test('returns 200', async () => {
    const res = await apiGet('/api/metrics');
    expect(res.status).toBe(200);
  });

  test('body is an object', async () => {
    const res = await apiGet('/api/metrics');
    expect(typeof res.body).toBe('object');
  });
});
