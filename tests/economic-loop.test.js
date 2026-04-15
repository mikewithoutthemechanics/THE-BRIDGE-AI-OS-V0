'use strict';
/**
 * tests/economic-loop.test.js
 * Minimal test suite for the Bridge AI OS economic-loop API endpoints:
 *   POST /api/auth/login
 *   GET  /api/me
 *   POST /api/agents/create
 *   POST /api/pay
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-min-32-chars-long!!';

const request = require('supertest');
const jwt     = require('jsonwebtoken');

// Import the Express app (server.js exports `app` without binding a port)
const app = require('../server');

const JWT_SECRET = process.env.JWT_SECRET;

// ── Helpers ───────────────────────────────────────────────────────────────────

let counter = 0;
function uniqEmail() {
  return `ecoloop_${Date.now()}_${++counter}@test.com`;
}

async function login(email) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email });
  return res;
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  test('200 with valid email', async () => {
    const res = await login(uniqEmail());
    expect(res.status).toBe(200);
  });

  test('response contains token, email, userId', async () => {
    const email = uniqEmail();
    const res = await login(email);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.email).toBe(email.toLowerCase());
    expect(res.body.userId).toBeDefined();
  });

  test('token is a valid JWT', async () => {
    const res = await login(uniqEmail());
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.email).toBeDefined();
  });

  test('superuser gets superadmin role in token', async () => {
    const res = await login('ryanpcowan@gmail.com');
    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.role).toBe('superadmin');
  });

  test('regular user gets member role in token', async () => {
    const res = await login(uniqEmail());
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.role).toBe('member');
  });

  test('400 on missing email', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  test('400 on invalid email (no @)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'notanemail' });
    expect(res.status).toBe(400);
  });
});

// ── GET /api/me ───────────────────────────────────────────────────────────────

describe('GET /api/me', () => {
  let token;

  beforeAll(async () => {
    const res = await login(uniqEmail());
    token = res.body.token;
  });

  test('200 with valid token', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('response has user, avatar, wallet, agents', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.user).toBeDefined();
    expect(res.body.avatar).toBeDefined();
    expect(res.body.wallet).toBeDefined();
    expect(Array.isArray(res.body.agents)).toBe(true);
  });

  test('401 without token', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });
});

// ── POST /api/agents/create ───────────────────────────────────────────────────

describe('POST /api/agents/create', () => {
  let token;

  beforeAll(async () => {
    const res = await login(uniqEmail());
    token = res.body.token;
  });

  test('201 on valid agent creation', async () => {
    const res = await request(app)
      .post('/api/agents/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'TestAgent', tier: 'standard' });
    expect(res.status).toBe(201);
  });

  test('response has agent with name and tier', async () => {
    const res = await request(app)
      .post('/api/agents/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'ProAgent', tier: 'pro' });
    expect(res.body.agent.name).toBe('ProAgent');
    expect(res.body.agent.tier).toBe('pro');
  });

  test('agent has its own wallet', async () => {
    const res = await request(app)
      .post('/api/agents/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'WalletAgent' });
    expect(res.body.agent.walletId).toBeDefined();
  });

  test('created agent appears in /api/me agents list', async () => {
    await request(app)
      .post('/api/agents/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'ListedAgent' });

    const me = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);

    const names = me.body.agents.map(a => a.name);
    expect(names).toContain('ListedAgent');
  });

  test('defaults to standard tier when tier is omitted', async () => {
    const res = await request(app)
      .post('/api/agents/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'DefaultTierAgent' });
    expect(res.body.agent.tier).toBe('standard');
  });

  test('400 on missing name', async () => {
    const res = await request(app)
      .post('/api/agents/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ tier: 'standard' });
    expect(res.status).toBe(400);
  });

  test('401 without token', async () => {
    const res = await request(app)
      .post('/api/agents/create')
      .send({ name: 'UnauthedAgent' });
    expect(res.status).toBe(401);
  });
});

// ── POST /api/pay ─────────────────────────────────────────────────────────────

describe('POST /api/pay', () => {
  let token;

  beforeAll(async () => {
    const res = await login(uniqEmail());
    token = res.body.token;
  });

  test('200 on valid payment', async () => {
    const res = await request(app)
      .post('/api/pay')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('response contains shares breakdown', async () => {
    const res = await request(app)
      .post('/api/pay')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100 });
    expect(res.body.shares.ubi).toBe(40);
    expect(res.body.shares.treasury).toBe(30);
    expect(res.body.shares.ops).toBe(20);
    expect(res.body.shares.founder).toBe(10);
  });

  test('shares sum equals original amount', async () => {
    const amount = 200;
    const res = await request(app)
      .post('/api/pay')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount });
    const { ubi, treasury, ops, founder } = res.body.shares;
    expect(Number((ubi + treasury + ops + founder).toFixed(2))).toBe(amount);
  });

  test('400 on zero amount', async () => {
    const res = await request(app)
      .post('/api/pay')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 0 });
    expect(res.status).toBe(400);
  });

  test('400 on negative amount', async () => {
    const res = await request(app)
      .post('/api/pay')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: -50 });
    expect(res.status).toBe(400);
  });

  test('400 on missing amount', async () => {
    const res = await request(app)
      .post('/api/pay')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('401 without token', async () => {
    const res = await request(app)
      .post('/api/pay')
      .send({ amount: 100 });
    expect(res.status).toBe(401);
  });
});
