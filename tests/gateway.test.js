'use strict';
/**
 * tests/gateway.test.js
 * Agent-6A — Full gateway endpoint coverage (corrected for data-service shapes)
 */

const request = require('supertest');
const app     = require('../gateway');

function expectCors(res) {
  expect(res.headers['access-control-allow-origin']).toBe('*');
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
  test('returns 200', async () => {
    const res = await request(app).get('/api/contracts');
    expect(res.status).toBe(200);
  });

  test('body has count as number', async () => {
    const res = await request(app).get('/api/contracts');
    expect(typeof res.body.count).toBe('number');
  });

  test('body has files array', async () => {
    const res = await request(app).get('/api/contracts');
    expect(Array.isArray(res.body.files)).toBe(true);
  });

  test('body has contracts object', async () => {
    const res = await request(app).get('/api/contracts');
    expect(typeof res.body.contracts).toBe('object');
  });

  test('files count matches count field', async () => {
    const res = await request(app).get('/api/contracts');
    expect(res.body.files.length).toBe(res.body.count);
  });

  test('all files end with .json', async () => {
    const res = await request(app).get('/api/contracts');
    res.body.files.forEach(f => expect(f.endsWith('.json')).toBe(true));
  });

  test('CORS header present', async () => {
    const res = await request(app).get('/api/contracts');
    expectCors(res);
  });
});

// ── /api/agents ───────────────────────────────────────────────────────────────

describe('GET /api/agents', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/agents');
    expect(res.status).toBe(200);
  });

  test('body has count', async () => {
    const res = await request(app).get('/api/agents');
    expect(typeof res.body.count).toBe('number');
  });

  test('body has layers with L1 and L2', async () => {
    const res = await request(app).get('/api/agents');
    expect(res.body.layers.L1).toBeDefined();
    expect(res.body.layers.L2).toBeDefined();
  });

  test('body has agents array', async () => {
    const res = await request(app).get('/api/agents');
    expect(Array.isArray(res.body.agents)).toBe(true);
  });

  test('count equals agents.length', async () => {
    const res = await request(app).get('/api/agents');
    expect(res.body.count).toBe(res.body.agents.length);
  });

  test('body has ts', async () => {
    const res = await request(app).get('/api/agents');
    expect(typeof res.body.ts).toBe('number');
  });

  test('CORS header present', async () => {
    const res = await request(app).get('/api/agents');
    expectCors(res);
  });
});

// ── POST /ask ─────────────────────────────────────────────────────────────────

describe('POST /ask', () => {
  test('400 without prompt', async () => {
    const res = await request(app).post('/ask').send({});
    expect(res.status).toBe(400);
  });

  test('400 error says prompt required', async () => {
    const res = await request(app).post('/ask').send({});
    expect(res.body.error).toBe('prompt required');
  });

  test('200 with valid prompt', async () => {
    const res = await request(app).post('/ask').send({ prompt: 'hello world' });
    expect(res.status).toBe(200);
  });

  test('response has id', async () => {
    const res = await request(app).post('/ask').send({ prompt: 'test' });
    expect(res.body.id).toBeDefined();
  });

  test('response has response field', async () => {
    const res = await request(app).post('/ask').send({ prompt: 'test query' });
    expect(res.body.response).toBeDefined();
  });

  test('stub response contains prompt text', async () => {
    const res = await request(app).post('/ask').send({ prompt: 'unique-prompt-xyz-abc' });
    expect(res.body.response).toContain('unique-prompt-xyz-abc');
  });

  test('CORS header on 400', async () => {
    const res = await request(app).post('/ask').send({});
    expectCors(res);
  });

  test('CORS header on 200', async () => {
    const res = await request(app).post('/ask').send({ prompt: 'cors-check' });
    expectCors(res);
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
  test('returns 200', async () => {
    const res = await request(app).get('/orchestrator/status');
    expect(res.status).toBe(200);
  });

  test('body.status is running', async () => {
    const res = await request(app).get('/orchestrator/status');
    expect(res.body.status).toBe('running');
  });

  test('body has active_agents count', async () => {
    const res = await request(app).get('/orchestrator/status');
    expect(typeof res.body.active_agents).toBe('number');
  });

  test('body.agents is an array', async () => {
    // Note: code has duplicate 'agents' key; last one (array) wins in JS
    const res = await request(app).get('/orchestrator/status');
    expect(Array.isArray(res.body.agents)).toBe(true);
  });

  test('body has ts', async () => {
    const res = await request(app).get('/orchestrator/status');
    expect(typeof res.body.ts).toBe('number');
  });

  test('CORS header present', async () => {
    const res = await request(app).get('/orchestrator/status');
    expectCors(res);
  });
});

// ── GET /billing ──────────────────────────────────────────────────────────────

describe('GET /billing', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/billing');
    expect(res.status).toBe(200);
  });

  test('body has treasury_balance', async () => {
    const res = await request(app).get('/billing');
    expect(typeof res.body.treasury_balance).toBe('number');
  });

  test('body has currency USD', async () => {
    const res = await request(app).get('/billing');
    expect(res.body.currency).toBe('USD');
  });

  test('body has subscriptions count', async () => {
    const res = await request(app).get('/billing');
    expect(typeof res.body.subscriptions).toBe('number');
  });

  test('body has active_plans array', async () => {
    const res = await request(app).get('/billing');
    expect(Array.isArray(res.body.active_plans)).toBe(true);
    expect(res.body.active_plans.length).toBeGreaterThan(0);
  });

  test('each plan has id, name, price, count', async () => {
    const res = await request(app).get('/billing');
    for (const plan of res.body.active_plans) {
      expect(plan.id).toBeDefined();
      expect(plan.name).toBeDefined();
      expect(typeof plan.price).toBe('number');
      expect(typeof plan.count).toBe('number');
    }
  });

  test('CORS header present', async () => {
    const res = await request(app).get('/billing');
    expectCors(res);
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

// ── Auth routes (in-process gateway auth) ────────────────────────────────────

describe('POST /auth/register (gateway in-process)', () => {
  const uniq = () => `gw_${Date.now()}_${Math.random().toString(36).slice(2)}@t.com`;

  test('201 on valid registration', async () => {
    const res = await request(app).post('/auth/register').send({ email: uniq(), password: 'pass123' });
    expect(res.status).toBe(201);
  });

  test('response has token', async () => {
    const res = await request(app).post('/auth/register').send({ email: uniq(), password: 'pass123' });
    expect(res.body.token).toBeDefined();
  });

  test('response has user object', async () => {
    const email = uniq();
    const res = await request(app).post('/auth/register').send({ email, password: 'pass123' });
    expect(res.body.user).toBeDefined();
  });

  test('400 on missing password', async () => {
    const res = await request(app).post('/auth/register').send({ email: uniq() });
    expect(res.status).toBe(400);
  });

  test('400 on missing email', async () => {
    const res = await request(app).post('/auth/register').send({ password: 'pass123' });
    expect(res.status).toBe(400);
  });

  test('409 on duplicate email', async () => {
    const email = uniq();
    await request(app).post('/auth/register').send({ email, password: 'pass123' });
    const res = await request(app).post('/auth/register').send({ email, password: 'pass123' });
    expect(res.status).toBe(409);
  });
});

describe('POST /auth/login (gateway in-process)', () => {
  const email    = `gwlogin_${Date.now()}@t.com`;
  const password = 'loginpass777';

  beforeAll(async () => {
    await request(app).post('/auth/register').send({ email, password });
  });

  test('200 on valid login', async () => {
    const res = await request(app).post('/auth/login').send({ email, password });
    expect(res.status).toBe(200);
  });

  test('token returned', async () => {
    const res = await request(app).post('/auth/login').send({ email, password });
    expect(res.body.token).toBeDefined();
  });

  test('401 on wrong password', async () => {
    const res = await request(app).post('/auth/login').send({ email, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('401 on unknown email', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'nobody@x.com', password });
    expect(res.status).toBe(401);
  });

  test('400 on empty body', async () => {
    const res = await request(app).post('/auth/login').send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /auth/verify (gateway in-process)', () => {
  let token;

  beforeAll(async () => {
    const email = `gwverify_${Date.now()}@t.com`;
    const res   = await request(app).post('/auth/register').send({ email, password: 'vpass999' });
    token = res.body.token;
  });

  test('200 with valid token', async () => {
    const res = await request(app).get('/auth/verify').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  test('401 without token', async () => {
    const res = await request(app).get('/auth/verify');
    expect(res.status).toBe(401);
  });

  test('401 with invalid token', async () => {
    const res = await request(app).get('/auth/verify').set('Authorization', 'Bearer not-a-token');
    expect(res.status).toBe(401);
  });
});
