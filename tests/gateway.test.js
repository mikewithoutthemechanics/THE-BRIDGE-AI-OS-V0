/**
 * gateway.test.js
 * Agent-6A — Unit Testing
 *
 * Tests all gateway endpoints defined in shared/gateway-api-spec.json.
 * Uses Node 18+ built-in fetch — no extra HTTP libraries required.
 *
 * The gateway must be running on port 8080 before these tests execute.
 * Endpoints that do not yet exist in gateway.js are expected to fail
 * and are documented accordingly.
 */

'use strict';

const BASE = 'http://localhost:8080';

// Increase default timeout: gateway may be slow to respond on first hit
jest.setTimeout(10000);

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function post(path, payload) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ---------------------------------------------------------------------------
// GET /health  (implemented in gateway.js)
// ---------------------------------------------------------------------------
describe('GET /health', () => {
  let result;

  beforeAll(async () => {
    result = await get('/health');
  });

  test('returns HTTP 200', () => {
    expect(result.status).toBe(200);
  });

  test('body contains status: "OK"', () => {
    expect(result.body).toBeDefined();
    expect(result.body.status).toBe('OK');
  });
});

// ---------------------------------------------------------------------------
// GET /api/topology  (not yet implemented — expected to fail)
// ---------------------------------------------------------------------------
describe('GET /api/topology', () => {
  let result;

  beforeAll(async () => {
    result = await get('/api/topology');
  });

  test('returns HTTP 200', () => {
    // NOTE: This endpoint is not yet wired in gateway.js.
    // Express 5 returns a 404 for unknown routes; test documents the gap.
    expect(result.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/registry/test  (not yet implemented — expected to fail)
// ---------------------------------------------------------------------------
describe('GET /api/registry/test', () => {
  let result;

  beforeAll(async () => {
    result = await get('/api/registry/test');
  });

  test('returns HTTP 200', () => {
    // NOTE: Not yet implemented in gateway.js — documents gap.
    expect(result.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/marketplace/test  (not yet implemented — expected to fail)
// ---------------------------------------------------------------------------
describe('GET /api/marketplace/test', () => {
  let result;

  beforeAll(async () => {
    result = await get('/api/marketplace/test');
  });

  test('returns HTTP 200', () => {
    // NOTE: Not yet implemented in gateway.js — documents gap.
    expect(result.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/contracts  (not yet implemented — expected to fail)
// ---------------------------------------------------------------------------
describe('GET /api/contracts', () => {
  let result;

  beforeAll(async () => {
    result = await get('/api/contracts');
  });

  test('returns HTTP 200', () => {
    // NOTE: Not yet implemented in gateway.js — documents gap.
    expect(result.status).toBe(200);
  });

  test('body is an array of contracts', () => {
    // NOTE: Will fail until the route is added.
    expect(Array.isArray(result.body)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /ask  (implemented in gateway.js — stub fallback always present)
// ---------------------------------------------------------------------------
describe('POST /ask', () => {
  let result;

  beforeAll(async () => {
    result = await post('/ask', { prompt: 'test' });
  });

  test('returns HTTP 200', () => {
    expect(result.status).toBe(200);
  });

  test('body contains a response field', () => {
    expect(result.body).toBeDefined();
    expect(result.body).toHaveProperty('response');
  });

  test('response field is a non-empty string', () => {
    expect(typeof result.body.response).toBe('string');
    expect(result.body.response.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// POST /ask — missing prompt (validation, should return 400)
// ---------------------------------------------------------------------------
describe('POST /ask — missing prompt', () => {
  let result;

  beforeAll(async () => {
    result = await post('/ask', {});
  });

  test('returns HTTP 400', () => {
    expect(result.status).toBe(400);
  });

  test('body contains error field', () => {
    expect(result.body).toHaveProperty('error');
  });
});
