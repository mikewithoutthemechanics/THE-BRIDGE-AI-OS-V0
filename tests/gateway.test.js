'use strict';
/**
 * tests/gateway.test.js
 * Agent-6A — Full gateway endpoint coverage
 * Requires: jest + supertest
 */

const request = require('supertest');
const app     = require('../gateway');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function expectCors(res) {
  expect(res.headers['access-control-allow-origin']).toBe('*');
}

// ─── /health ─────────────────────────────────────────────────────────────────

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

  test('body has ts (timestamp)', async () => {
    const res = await request(app).get('/health');
    expect(typeof res.body.ts).toBe('number');
  });

  test('CORS header present', async () => {
    const res = await request(app).get('/health');
    expectCors(res);
  });
});

// ─── /api/topology ───────────────────────────────────────────────────────────

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

  test('stub flag present when core unreachable', async () => {
    const res = await request(app).get('/api/topology');
    expect(res.body.stub).toBe(true);
  });

  test('body has ts', async () => {
    const res = await request(app).get('/api/topology');
    expect(typeof res.body.ts).toBe('number');
  });

  test('CORS header present', async () => {
    const res = await request(app).get('/api/topology');
    expectCors(res);
  });
});

// ─── /api/avatar/:id ─────────────────────────────────────────────────────────

describe('GET /api/avatar/:id', () => {
  test('returns 200 for simple id', async () => {
    const res = await request(app).get('/api/avatar/agent-007');
    expect(res.status).toBe(200);
  });

  test('body has stub: true', async () => {
    const res = await request(app).get('/api/avatar/agent-007');
    expect(res.body.stub).toBe(true);
  });

  test('body has scene object', async () => {
    const res = await request(app).get('/api/avatar/agent-007');
    expect(typeof res.body.scene).toBe('object');
  });

  test('scene contains avatar_id', async () => {
    const res = await request(app).get('/api/avatar/agent-007');
    expect(res.body.scene.avatar_id).toContain('agent-007');
  });

  test('CORS header present', async () => {
    const res = await request(app).get('/api/avatar/test');
    expectCors(res);
  });
});

// ─── /api/registry/* ─────────────────────────────────────────────────────────

describe('GET /api/registry/kernel', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/registry/kernel');
    expect(res.status).toBe(200);
  });

  test('body.stub is true', async () => {
    const res = await request(app).get('/api/registry/kernel');
    expect(res.body.stub).toBe(true);
  });

  test('body.namespace is kernel', async () => {
    const res = await request(app).get('/api/registry/kernel');
    expect(res.body.namespace).toBe('kernel');
  });

  test('data has version', async () => {
    const res = await request(app).get('/api/registry/kernel');
    expect(res.body.data.version).toBeDefined();
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

  test('data has interfaces', async () => {
    const res = await request(app).get('/api/registry/network');
    expect(Array.isArray(res.body.data.interfaces)).toBe(true);
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

  test('data.tls is boolean', async () => {
    const res = await request(app).get('/api/registry/security');
    expect(typeof res.body.data.tls).toBe('boolean');
  });
});

describe('GET /api/registry/federation', () => {
  test('returns 200 for unknown namespace', async () => {
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
});

describe('GET /api/registry/market', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/registry/market');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/registry/bridgeos', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/registry/bridgeos');
    expect(res.status).toBe(200);
  });
});

// ─── /api/marketplace/* ──────────────────────────────────────────────────────

describe('GET /api/marketplace/tasks', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/marketplace/tasks');
    expect(res.status).toBe(200);
  });

  test('stub is true', async () => {
    const res = await request(app).get('/api/marketplace/tasks');
    expect(res.body.stub).toBe(true);
  });

  test('section is tasks', async () => {
    const res = await request(app).get('/api/marketplace/tasks');
    expect(res.body.section).toBe('tasks');
  });

  test('data has listings array', async () => {
    const res = await request(app).get('/api/marketplace/tasks');
    expect(Array.isArray(res.body.data.listings)).toBe(true);
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

  test('data has pairs', async () => {
    const res = await request(app).get('/api/marketplace/dex');
    expect(Array.isArray(res.body.data.pairs)).toBe(true);
  });
});

describe('GET /api/marketplace/wallet', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/marketplace/wallet');
    expect(res.status).toBe(200);
  });

  test('data has address', async () => {
    const res = await request(app).get('/api/marketplace/wallet');
    expect(res.body.data.address).toBeDefined();
  });
});

describe('GET /api/marketplace/skills', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/marketplace/skills');
    expect(res.status).toBe(200);
  });

  test('data has available array', async () => {
    const res = await request(app).get('/api/marketplace/skills');
    expect(Array.isArray(res.body.data.available)).toBe(true);
  });
});

describe('GET /api/marketplace/portfolio', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/marketplace/portfolio');
    expect(res.status).toBe(200);
  });

  test('data has total_value_usd', async () => {
    const res = await request(app).get('/api/marketplace/portfolio');
    expect(typeof res.body.data.total_value_usd).toBe('number');
  });
});

describe('GET /api/marketplace/stats', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/marketplace/stats');
    expect(res.status).toBe(200);
  });

  test('data has total_tasks', async () => {
    const res = await request(app).get('/api/marketplace/stats');
    expect(typeof res.body.data.total_tasks).toBe('number');
  });
});

// ─── /api/status ─────────────────────────────────────────────────────────────

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

  test('services includes gateway entry', async () => {
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

// ─── /api/contracts ──────────────────────────────────────────────────────────

describe('GET /api/contracts', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/contracts');
    expect(res.status).toBe(200);
  });

  test('body has count', async () => {
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

  test('CORS header present', async () => {
    const res = await request(app).get('/api/contracts');
    expectCors(res);
  });
});

// ─── /api/agents ─────────────────────────────────────────────────────────────

describe('GET /api/agents', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/api/agents');
    expect(res.status).toBe(200);
  });

  test('body has count', async () => {
    const res = await request(app).get('/api/agents');
    expect(typeof res.body.count).toBe('number');
  });

  test('body has layers object', async () => {
    const res = await request(app).get('/api/agents');
    expect(typeof res.body.layers).toBe('object');
  });

  test('body has agents array', async () => {
    const res = await request(app).get('/api/agents');
    expect(Array.isArray(res.body.agents)).toBe(true);
  });

  test('layers has L1 and L2', async () => {
    const res = await request(app).get('/api/agents');
    expect(res.body.layers.L1).toBeDefined();
    expect(res.body.layers.L2).toBeDefined();
  });

  test('CORS header present', async () => {
    const res = await request(app).get('/api/agents');
    expectCors(res);
  });
});

// ─── POST /ask ────────────────────────────────────────────────────────────────

describe('POST /ask', () => {
  test('400 without prompt', async () => {
    const res = await request(app).post('/ask').send({});
    expect(res.status).toBe(400);
  });

  test('400 error message', async () => {
    const res = await request(app).post('/ask').send({});
    expect(res.body.error).toBe('prompt required');
  });

  test('200 with prompt', async () => {
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

  test('stub response echoes prompt', async () => {
    const res = await request(app).post('/ask').send({ prompt: 'my-unique-prompt-xyz' });
    expect(res.body.response).toContain('my-unique-prompt-xyz');
  });

  test('CORS header present on 400', async () => {
    const res = await request(app).post('/ask').send({});
    expectCors(res);
  });

  test('CORS header present on 200', async () => {
    const res = await request(app).post('/ask').send({ prompt: 'cors check' });
    expectCors(res);
  });
});

// ─── GET /events/stream (SSE) ────────────────────────────────────────────────

describe('GET /events/stream', () => {
  test('returns 200 with SSE content-type', (done) => {
    const req = request(app)
      .get('/events/stream')
      .buffer(false)
      .parse((res, callback) => {
        res.on('data', () => {});
        res.on('end', callback);
      });

    req.on('response', (res) => {
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      req.abort();
      done();
    });
  });

  test('SSE sets Cache-Control no-cache', (done) => {
    const req = request(app)
      .get('/events/stream')
      .buffer(false)
      .parse((res, callback) => {
        res.on('data', () => {});
        res.on('end', callback);
      });

    req.on('response', (res) => {
      expect(res.headers['cache-control']).toContain('no-cache');
      req.abort();
      done();
    });
  });
});

// ─── GET /orchestrator/status ─────────────────────────────────────────────────

describe('GET /orchestrator/status', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/orchestrator/status');
    expect(res.status).toBe(200);
  });

  test('body.status is running', async () => {
    const res = await request(app).get('/orchestrator/status');
    expect(res.body.status).toBe('running');
  });

  test('body.agents is a number', async () => {
    const res = await request(app).get('/orchestrator/status');
    expect(typeof res.body.agents).toBe('number');
  });

  test('body has active_agents count', async () => {
    const res = await request(app).get('/orchestrator/status');
    expect(typeof res.body.active_agents).toBe('number');
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

// ─── GET /billing ─────────────────────────────────────────────────────────────

describe('GET /billing', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/billing');
    expect(res.status).toBe(200);
  });

  test('body has treasury_balance', async () => {
    const res = await request(app).get('/billing');
    expect(typeof res.body.treasury_balance).toBe('number');
  });

  test('body has currency', async () => {
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

// ─── OPTIONS preflight ────────────────────────────────────────────────────────

describe('OPTIONS preflight', () => {
  test('returns 204 for preflight', async () => {
    const res = await request(app).options('/health');
    expect(res.status).toBe(204);
  });

  test('CORS allow-methods header present', async () => {
    const res = await request(app).options('/api/status');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });

  test('CORS allow-headers present', async () => {
    const res = await request(app).options('/api/contracts');
    expect(res.headers['access-control-allow-headers']).toContain('Content-Type');
  });
});

// ─── Unknown registry / marketplace namespaces fall through to stub ──────────

describe('Stub fallback for unknown namespaces', () => {
  test('GET /api/registry/nonexistent returns 200 with stub', async () => {
    const res = await request(app).get('/api/registry/nonexistent');
    expect(res.status).toBe(200);
    expect(res.body.namespace).toBe('nonexistent');
  });

  test('GET /api/marketplace/nonexistent returns 200 with stub', async () => {
    const res = await request(app).get('/api/marketplace/nonexistent');
    expect(res.status).toBe(200);
    expect(res.body.section).toBe('nonexistent');
  });
});

// ─── Auth routes in gateway ───────────────────────────────────────────────────

describe('POST /auth/register (gateway in-process auth)', () => {
  const uniq = () => `gwtest_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`;

  test('201 on valid registration', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: uniq(), password: 'password123' });
    expect(res.status).toBe(201);
  });

  test('response has token', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: uniq(), password: 'password123' });
    expect(res.body.token).toBeDefined();
  });

  test('response has user object with email', async () => {
    const email = uniq();
    const res = await request(app)
      .post('/auth/register')
      .send({ email, password: 'password123' });
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBeDefined();
  });

  test('400 on missing password', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: uniq() });
    expect(res.status).toBe(400);
  });

  test('400 on missing email', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ password: 'password123' });
    expect(res.status).toBe(400);
  });

  test('409 on duplicate email', async () => {
    const email = uniq();
    await request(app).post('/auth/register').send({ email, password: 'password123' });
    const res = await request(app).post('/auth/register').send({ email, password: 'password123' });
    expect(res.status).toBe(409);
  });
});

describe('POST /auth/login (gateway in-process auth)', () => {
  const email    = `gwlogin_${Date.now()}@test.com`;
  const password = 'loginpass999';

  beforeAll(async () => {
    await request(app).post('/auth/register').send({ email, password });
  });

  test('200 on valid login', async () => {
    const res = await request(app).post('/auth/login').send({ email, password });
    expect(res.status).toBe(200);
  });

  test('token returned on login', async () => {
    const res = await request(app).post('/auth/login').send({ email, password });
    expect(res.body.token).toBeDefined();
  });

  test('401 on wrong password', async () => {
    const res = await request(app).post('/auth/login').send({ email, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('401 on unknown email', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'nobody@nope.com', password });
    expect(res.status).toBe(401);
  });

  test('400 on missing fields', async () => {
    const res = await request(app).post('/auth/login').send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /auth/verify (gateway in-process auth)', () => {
  let token;
  const email = `gwverify_${Date.now()}@test.com`;

  beforeAll(async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email, password: 'verifypass' });
    token = res.body.token;
  });

  test('200 with valid token', async () => {
    const res = await request(app)
      .get('/auth/verify')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  test('401 without token', async () => {
    const res = await request(app).get('/auth/verify');
    expect(res.status).toBe(401);
  });

  test('401 with invalid token', async () => {
    const res = await request(app)
      .get('/auth/verify')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});
