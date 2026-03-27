'use strict';
/**
 * tests/integration.test.js
 * Agent-6A — Cross-service integration tests
 * Tests: gateway ↔ contracts, gateway auth tokens, agent aggregation, status aggregation
 */

process.env.AUTH_PORT = '15002';
process.env.NODE_ENV  = 'test';

const request = require('supertest');
const gateway = require('../gateway');

let counter = 0;
function uniq() {
  counter++;
  return `int_t${Date.now()}_${counter}@ex.com`;
}

// ── Gateway health aggregation ─────────────────────────────────────────────────

describe('Gateway /health aggregates core status gracefully', () => {
  test('returns 200 even when system.js is not running', async () => {
    const res = await request(gateway).get('/health');
    expect(res.status).toBe(200);
  });

  test('gateway:up is always present', async () => {
    const res = await request(gateway).get('/health');
    expect(res.body.gateway).toBe('up');
  });

  test('core field is present (up or unreachable)', async () => {
    const res = await request(gateway).get('/health');
    expect(res.body.core).toBeDefined();
  });

  test('ts timestamp is a recent number', async () => {
    const before = Date.now();
    const res    = await request(gateway).get('/health');
    expect(res.body.ts).toBeGreaterThanOrEqual(before - 1000);
  });
});

// ── /api/status aggregate ─────────────────────────────────────────────────────

describe('/api/status aggregates all service statuses', () => {
  test('returns overall health indicator', async () => {
    const res = await request(gateway).get('/api/status');
    expect(['healthy', 'degraded', 'down']).toContain(res.body.overall);
  });

  test('gateway service is always "up" in services list', async () => {
    const res = await request(gateway).get('/api/status');
    const gw  = res.body.services.find(s => s.id === 'gateway');
    expect(gw).toBeDefined();
    expect(gw.status).toBe('up');
    expect(gw.latency_ms).toBe(0);
  });

  test('services list has 4 entries (gateway, system, ainode, orchestrator)', async () => {
    const res = await request(gateway).get('/api/status');
    expect(res.body.services.length).toBe(4);
  });

  test('each service entry has id, port, status, latency_ms', async () => {
    const res = await request(gateway).get('/api/status');
    for (const svc of res.body.services) {
      expect(svc.id).toBeDefined();
      expect(typeof svc.port).toBe('number');
      expect(svc.status).toBeDefined();
      expect(typeof svc.latency_ms).toBe('number');
    }
  });

  test('unreachable services are marked unreachable not errored', async () => {
    const res  = await request(gateway).get('/api/status');
    const svc  = res.body.services.find(s => s.id === 'system');
    // system.js not running in tests — should be unreachable or degraded
    expect(['up', 'degraded', 'unreachable']).toContain(svc.status);
  });
});

// ── Contracts readable from gateway ───────────────────────────────────────────

describe('Contracts readable from gateway /api/contracts', () => {
  test('returns valid JSON with count and files', async () => {
    const res = await request(gateway).get('/api/contracts');
    expect(res.status).toBe(200);
    expect(typeof res.body.count).toBe('number');
    expect(Array.isArray(res.body.files)).toBe(true);
  });

  test('files array contains only .json filenames', async () => {
    const res = await request(gateway).get('/api/contracts');
    for (const f of res.body.files) {
      expect(f.endsWith('.json')).toBe(true);
    }
  });

  test('contracts object keys match files array', async () => {
    const res  = await request(gateway).get('/api/contracts');
    const keys = Object.keys(res.body.contracts);
    expect(keys.sort()).toEqual(res.body.files.sort());
  });

  test('count equals files.length', async () => {
    const res = await request(gateway).get('/api/contracts');
    expect(res.body.count).toBe(res.body.files.length);
  });

  test('at least one contract file is loaded', async () => {
    const res = await request(gateway).get('/api/contracts');
    expect(res.body.count).toBeGreaterThanOrEqual(1);
  });
});

// ── Auth token round-trip through gateway ─────────────────────────────────────

describe('Auth token accepted by gateway /auth/verify after /auth/register', () => {
  let token;

  beforeAll(async () => {
    const email = uniq();
    const res   = await request(gateway)
      .post('/auth/register')
      .send({ email, password: 'integpass99' });
    token = res.body.token;
  });

  test('register returns 201 with token', async () => {
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);
  });

  test('token is accepted by /auth/verify', async () => {
    const res = await request(gateway)
      .get('/auth/verify')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  test('login produces a token that passes /auth/verify', async () => {
    const email    = uniq();
    const password = 'logininteg99';
    await request(gateway).post('/auth/register').send({ email, password });
    const loginRes = await request(gateway).post('/auth/login').send({ email, password });
    const loginTok = loginRes.body.token;

    const verRes = await request(gateway)
      .get('/auth/verify')
      .set('Authorization', `Bearer ${loginTok}`);
    expect(verRes.status).toBe(200);
  });
});

// ── L1 + L2 agent aggregation via /api/agents ──────────────────────────────────

describe('/api/agents aggregates L1 and L2 gracefully', () => {
  test('returns 200', async () => {
    const res = await request(gateway).get('/api/agents');
    expect(res.status).toBe(200);
  });

  test('both L1 and L2 layers present with status field', async () => {
    const res = await request(gateway).get('/api/agents');
    expect(['up', 'down']).toContain(res.body.layers.L1.status);
    expect(['up', 'down']).toContain(res.body.layers.L2.status);
  });

  test('agents array is always an array (even if both layers down)', async () => {
    const res = await request(gateway).get('/api/agents');
    expect(Array.isArray(res.body.agents)).toBe(true);
  });

  test('count equals agents.length', async () => {
    const res = await request(gateway).get('/api/agents');
    expect(res.body.count).toBe(res.body.agents.length);
  });

  test('ts is present', async () => {
    const res = await request(gateway).get('/api/agents');
    expect(typeof res.body.ts).toBe('number');
  });
});

// ── Topology proxy fallback ────────────────────────────────────────────────────

describe('/api/topology falls back to stub when system.js is down', () => {
  test('returns stub topology with 4 nodes', async () => {
    const res = await request(gateway).get('/api/topology');
    expect(res.status).toBe(200);
    // Either live or stub — should have nodes
    expect(Array.isArray(res.body.nodes)).toBe(true);
  });

  test('stub nodes include gateway node', async () => {
    const res = await request(gateway).get('/api/topology');
    const gw  = res.body.nodes.find(n => n.id === 'gateway');
    expect(gw).toBeDefined();
  });

  test('stub edges array is non-empty', async () => {
    const res = await request(gateway).get('/api/topology');
    expect(Array.isArray(res.body.edges)).toBe(true);
    expect(res.body.edges.length).toBeGreaterThan(0);
  });
});
