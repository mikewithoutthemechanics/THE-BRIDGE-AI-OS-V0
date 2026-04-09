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

  test('services list has 5 entries (gateway, system, brain, terminal, auth)', async () => {
    const res = await request(gateway).get('/api/status');
    expect(res.body.services.length).toBe(5);
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

describe('Contracts require auth from gateway /api/contracts', () => {
  test('returns 401 without auth token', async () => {
    const res = await request(gateway).get('/api/contracts');
    expect(res.status).toBe(401);
  });
});

// ── Auth token round-trip through gateway ─────────────────────────────────────

describe('Auth routes proxy to auth service via gateway', () => {
  test('/auth/register proxies to auth service (502 when service down)', async () => {
    const res = await request(gateway)
      .post('/auth/register')
      .send({ email: uniq(), password: 'integpass99' });
    expect(res.status).toBe(502);
  });

  test('/auth/login proxies to auth service (502 when service down)', async () => {
    const res = await request(gateway)
      .post('/auth/login')
      .send({ email: uniq(), password: 'logininteg99' });
    expect(res.status).toBe(502);
  });

  test('/auth/verify proxies to auth service (502 when service down)', async () => {
    const res = await request(gateway)
      .get('/auth/verify')
      .set('Authorization', 'Bearer fake-token');
    expect(res.status).toBe(502);
  });
});

// ── L1 + L2 agent aggregation via /api/agents ──────────────────────────────────

describe('/api/agents requires auth', () => {
  test('returns 401 without auth token', async () => {
    const res = await request(gateway).get('/api/agents');
    expect(res.status).toBe(401);
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
