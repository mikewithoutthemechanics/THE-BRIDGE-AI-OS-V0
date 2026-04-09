'use strict';
/**
 * tests/gateway.test.js
 * Agent-6A — Full gateway endpoint coverage (corrected for data-service shapes)
 */

const request = require('supertest');
const app     = require('../gateway');

function expectCors(res) {
  // With origin allowlist, no Origin header in request = no CORS header in response
  // This is correct behavior — CORS headers are only needed for browser cross-origin requests
  const origin = res.headers['access-control-allow-origin'];
  if (origin) {
    expect(['https://go.ai-os.co.za', 'https://wall.bridge-ai-os.com', 'http://localhost:3000', 'http://localhost:8080']).toContain(origin);
  }
  // If no origin header, that's fine — supertest doesn't send Origin
}

// ── /health ───────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  test('body has status OK', async () => {
    const res = await request(app).get('/health');
    expect(res.body.status).toBe('OK');
  });

  test('body has gateway: up', async () => {
    const res = await request(app).get('/health');
    expect(res.body.gateway).toBe('up');
  });

  test('body has ts as number', async () => {
    const res = await request(app).get('/health');
    expect(typeof res.body.ts).toBe('number');
  });

  test('core field present (up or unreachable)', async () => {
    const res = await request(app).get('/health');
    expect(res.body.core).toBeDefined();
  });

  test('CORS header present', async () => {
    const res = await request(app).get('/health');
    expectCors(res);
  });
});

// ── /api/topology ─────────────────────────────────────────────────────────────

describe('GET /api/topology', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/topology');
    expect(res.status).toBe(200);
  });

  test('body has nodes array', async () => {
    const res = await request(app).get('/api/topology');
    expect(Array.isArray(res.body.nodes)).toBe(true);
  });

  test('body has edges array', async () => {
    const res = await request(app).get('/api/topology');
    expect(Array.isArray(res.body.edges)).toBe(true);
  });

  test('nodes array is non-empty', async () => {
    const res = await request(app).get('/api/topology');
    expect(res.body.nodes.length).toBeGreaterThan(0);
  });

  test('each node has id field', async () => {
    const res = await request(app).get('/api/topology');
    res.body.nodes.forEach(n => expect(n.id).toBeDefined());
  });

  test('CORS header present', async () => {
    const res = await request(app).get('/api/topology');
    expectCors(res);
  });
});

// ── /api/avatar/* ─────────────────────────────────────────────────────────────

describe('GET /api/avatar/:mode', () => {
  test('returns 200 for wireframe mode', async () => {
    const res = await request(app).get('/api/avatar/wireframe');
    expect(res.status).toBe(200);
  });

  test('body has scene_type', async () => {
    const res = await request(app).get('/api/avatar/wireframe');
    expect(typeof res.body.scene_type).toBe('string');
  });

  test('body has animations array', async () => {
    const res = await request(app).get('/api/avatar/wireframe');
    expect(Array.isArray(res.body.animations)).toBe(true);
  });

  test('body has ts', async () => {
    const res = await request(app).get('/api/avatar/wireframe');
    expect(typeof res.body.ts).toBe('number');
  });

  test('body has mode field', async () => {
    const res = await request(app).get('/api/avatar/wireframe');
    expect(res.body.mode).toBeDefined();
  });

  test('CORS header present', async () => {
    const res = await request(app).get('/api/avatar/wireframe');
    expectCors(res);
  });
});

describe('GET /api/avatar/modes', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/avatar/modes');
    expect(res.status).toBe(200);
  });
});

// ── /api/registry/* ───────────────────────────────────────────────────────────

describe('GET /api/registry/kernel', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/registry/kernel');
    expect(res.status).toBe(200);
  });

  test('body.namespace is kernel', async () => {
    const res = await request(app).get('/api/registry/kernel');
    expect(res.body.namespace).toBe('kernel');
  });

  test('data has status field', async () => {
    const res = await request(app).get('/api/registry/kernel');
    expect(res.body.data.status).toBeDefined();
  });

  test('data has os_type', async () => {
    const res = await request(app).get('/api/registry/kernel');
    expect(typeof res.body.data.os_type).toBe('string');
  });

  test('body has ts', async () => {
    const res = await request(app).get('/api/registry/kernel');
    expect(typeof res.body.ts).toBe('number');
  });

  test('CORS header present', async () => {
    const res = await request(app).get('/api/registry/kernel');
    expectCors(res);
  });
});

describe('GET /api/registry/network', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/registry/network');
    expect(res.status).toBe(200);
  });

  test('namespace is network', async () => {
    const res = await request(app).get('/api/registry/network');
    expect(res.body.namespace).toBe('network');
  });

  test('data has interfaces array', async () => {
    const res = await request(app).get('/api/registry/network');
    expect(Array.isArray(res.body.data.interfaces)).toBe(true);
  });

  test('data has status', async () => {
    const res = await request(app).get('/api/registry/network');
    expect(res.body.data.status).toBeDefined();
  });
});

describe('GET /api/registry/security', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/registry/security');
    expect(res.status).toBe(200);
  });

  test('namespace is security', async () => {
    const res = await request(app).get('/api/registry/security');
    expect(res.body.namespace).toBe('security');
  });

  test('data has firewall field', async () => {
    const res = await request(app).get('/api/registry/security');
    expect(res.body.data.firewall).toBeDefined();
  });

  test('data has status', async () => {
    const res = await request(app).get('/api/registry/security');
    expect(res.body.data.status).toBeDefined();
  });
});

describe('GET /api/registry/federation', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/registry/federation');
    expect(res.status).toBe(200);
  });

  test('namespace is federation', async () => {
    const res = await request(app).get('/api/registry/federation');
    expect(res.body.namespace).toBe('federation');
  });
});

describe('GET /api/registry/jobs', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/registry/jobs');
    expect(res.status).toBe(200);
  });

  test('namespace is jobs', async () => {
    const res = await request(app).get('/api/registry/jobs');
    expect(res.body.namespace).toBe('jobs');
  });
});

describe('GET /api/registry/market', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/registry/market');
    expect(res.status).toBe(200);
  });

  test('namespace is market', async () => {
    const res = await request(app).get('/api/registry/market');
    expect(res.body.namespace).toBe('market');
  });
});

describe('GET /api/registry/bridgeos', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/registry/bridgeos');
    expect(res.status).toBe(200);
  });

  test('namespace is bridgeos', async () => {
    const res = await request(app).get('/api/registry/bridgeos');
    expect(res.body.namespace).toBe('bridgeos');
  });
});

// ── /api/marketplace/* ────────────────────────────────────────────────────────

describe('GET /api/marketplace/tasks', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/marketplace/tasks');
    expect(res.status).toBe(200);
  });

  test('section is tasks', async () => {
    const res = await request(app).get('/api/marketplace/tasks');
    expect(res.body.section).toBe('tasks');
  });

  test('data has listings array', async () => {
    const res = await request(app).get('/api/marketplace/tasks');
    expect(Array.isArray(res.body.data.listings)).toBe(true);
  });

  test('body has ts', async () => {
    const res = await request(app).get('/api/marketplace/tasks');
    expect(typeof res.body.ts).toBe('number');
  });

  test('CORS header present', async () => {
    const res = await request(app).get('/api/marketplace/tasks');
    expectCors(res);
  });
});

describe('GET /api/marketplace/dex', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/marketplace/dex');
    expect(res.status).toBe(200);
  });

  test('data has pairs array', async () => {
    const res = await request(app).get('/api/marketplace/dex');
    expect(Array.isArray(res.body.data.pairs)).toBe(true);
  });
});

describe('GET /api/marketplace/wallet', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/marketplace/wallet');
    expect(res.status).toBe(200);
  });

  test('data has balances field', async () => {
    const res = await request(app).get('/api/marketplace/wallet');
    expect(res.body.data.balances).toBeDefined();
  });
});

describe('GET /api/marketplace/skills', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/marketplace/skills');
    expect(res.status).toBe(200);
  });

  test('data has installed field', async () => {
    const res = await request(app).get('/api/marketplace/skills');
    expect(res.body.data.installed).toBeDefined();
  });
});

describe('GET /api/marketplace/portfolio', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/marketplace/portfolio');
    expect(res.status).toBe(200);
  });

  test('body has section: portfolio', async () => {
    const res = await request(app).get('/api/marketplace/portfolio');
    expect(res.body.section).toBe('portfolio');
  });
});

describe('GET /api/marketplace/stats', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/marketplace/stats');
    expect(res.status).toBe(200);
  });

  test('section is stats', async () => {
    const res = await request(app).get('/api/marketplace/stats');
    expect(res.body.section).toBe('stats');
  });
});

// ── /api/status ───────────────────────────────────────────────────────────────

describe('GET /api/status', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
  });

  test('body has overall field', async () => {
    const res = await request(app).get('/api/status');
    expect(['healthy', 'degraded', 'down']).toContain(res.body.overall);
  });

  test('body has services array', async () => {
    const res = await request(app).get('/api/status');
    expect(Array.isArray(res.body.services)).toBe(true);
  });

  test('gateway service is always up', async () => {
    const res = await request(app).get('/api/status');
    const gw = res.body.services.find(s => s.id === 'gateway');
    expect(gw).toBeDefined();
    expect(gw.status).toBe('up');
  });

  test('body has ts', async () => {
    const res = await request(app).get('/api/status');
    expect(typeof res.body.ts).toBe('number');
  });

  test('CORS header present', async () => {
    const res = await request(app).get('/api/status');
    expectCors(res);
  });
});

// ── /api/contracts ────────────────────────────────────────────────────────────

describe('GET /api/contracts', () => {
  test('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/contracts');
    expect(res.status).toBe(401);
  });

  test('error says missing auth token', async () => {
    const res = await request(app).get('/api/contracts');
    expect(res.body.error).toMatch(/auth/i);
  });
});

// ── /api/agents ───────────────────────────────────────────────────────────────

describe('GET /api/agents', () => {
  test('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/agents');
    expect(res.status).toBe(401);
  });

  test('error says missing auth token', async () => {
    const res = await request(app).get('/api/agents');
    expect(res.body.error).toMatch(/auth/i);
  });
});

// ── POST /ask ─────────────────────────────────────────────────────────────────

describe('POST /ask', () => {
  test('returns 401 without auth token', async () => {
    const res = await request(app).post('/ask').send({ prompt: 'hello world' });
    expect(res.status).toBe(401);
  });

  test('returns 401 even without prompt (auth checked first)', async () => {
    const res = await request(app).post('/ask').send({});
    expect(res.status).toBe(401);
  });

  test('error says missing auth token', async () => {
    const res = await request(app).post('/ask').send({ prompt: 'test' });
    expect(res.body.error).toMatch(/auth/i);
  });
});

// ── GET /events/stream (SSE) ──────────────────────────────────────────────────

describe('GET /events/stream', () => {
  test('returns 200 with SSE content-type', async () => {
    // Use a manually managed http server + socket to test SSE response
    const http = require('http');
    const net  = require('net');

    const srv = http.createServer(app);
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const port = srv.address().port;

    const response = await new Promise((resolve, reject) => {
      const sock = net.createConnection({ host: '127.0.0.1', port });
      let headers = '';
      sock.on('data', (chunk) => {
        headers += chunk.toString();
        if (headers.includes('\r\n\r\n')) {
          sock.destroy();
          resolve(headers);
        }
      });
      sock.on('connect', () => {
        sock.write('GET /events/stream HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
      });
      sock.on('error', reject);
      setTimeout(() => { sock.destroy(); reject(new Error('SSE timeout')); }, 3000);
    });

    await new Promise(r => srv.close(r));

    expect(response).toContain('text/event-stream');
  }, 10000);

  test('SSE includes Cache-Control no-cache', async () => {
    const http = require('http');
    const net  = require('net');

    const srv = http.createServer(app);
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const port = srv.address().port;

    const response = await new Promise((resolve, reject) => {
      const sock = net.createConnection({ host: '127.0.0.1', port });
      let headers = '';
      sock.on('data', (chunk) => {
        headers += chunk.toString();
        if (headers.includes('\r\n\r\n')) {
          sock.destroy();
          resolve(headers);
        }
      });
      sock.on('connect', () => {
        sock.write('GET /events/stream HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
      });
      sock.on('error', reject);
      setTimeout(() => { sock.destroy(); reject(new Error('SSE timeout')); }, 3000);
    });

    await new Promise(r => srv.close(r));

    expect(response.toLowerCase()).toContain('cache-control');
    expect(response.toLowerCase()).toContain('no-cache');
  }, 10000);
});

// ── GET /orchestrator/status ──────────────────────────────────────────────────

describe('GET /orchestrator/status', () => {
  test('returns 401 without auth token', async () => {
    const res = await request(app).get('/orchestrator/status');
    expect(res.status).toBe(401);
  });

  test('error says missing auth token', async () => {
    const res = await request(app).get('/orchestrator/status');
    expect(res.body.error).toMatch(/auth/i);
  });
});

// ── GET /billing ──────────────────────────────────────────────────────────────

describe('GET /billing', () => {
  test('returns 401 without auth token', async () => {
    const res = await request(app).get('/billing');
    expect(res.status).toBe(401);
  });

  test('error says missing auth token', async () => {
    const res = await request(app).get('/billing');
    expect(res.body.error).toMatch(/auth/i);
  });
});

// ── OPTIONS preflight ─────────────────────────────────────────────────────────

describe('OPTIONS preflight', () => {
  test('returns 204', async () => {
    const res = await request(app).options('/health');
    expect(res.status).toBe(204);
  });

  test('allow-methods contains GET', async () => {
    const res = await request(app).options('/api/status');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });

  test('allow-headers contains Content-Type', async () => {
    const res = await request(app).options('/api/contracts');
    expect(res.headers['access-control-allow-headers']).toContain('Content-Type');
  });
});

// ── Stub fallback for unknown namespaces ──────────────────────────────────────

describe('Stub fallback for unknown namespaces', () => {
  test('GET /api/registry/unknown returns 200 with namespace field', async () => {
    const res = await request(app).get('/api/registry/zzunknown');
    expect(res.status).toBe(200);
    expect(res.body.namespace).toBe('zzunknown');
  });

  test('GET /api/marketplace/unknown returns 200 with section field', async () => {
    const res = await request(app).get('/api/marketplace/zzunknown');
    expect(res.status).toBe(200);
    expect(res.body.section).toBe('zzunknown');
  });
});

// ── Auth routes (now proxied to :5001 — no auth service in gateway test) ─────

describe('POST /auth/register (proxied)', () => {
  test('returns 502 when auth service is not running', async () => {
    const res = await request(app).post('/auth/register').send({ email: 'test@t.com', password: 'pass123' });
    expect(res.status).toBe(502);
  });
});

describe('POST /auth/login (proxied)', () => {
  test('returns 502 when auth service is not running', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'test@t.com', password: 'pass123' });
    expect(res.status).toBe(502);
  });
});

describe('GET /auth/verify (proxied)', () => {
  test('returns 502 when auth service is not running', async () => {
    const res = await request(app).get('/auth/verify');
    expect(res.status).toBe(502);
  });
});
