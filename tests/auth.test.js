'use strict';
/**
 * tests/auth.test.js
 * Agent-6A — Full auth.js service coverage
 */

process.env.AUTH_PORT = '15001';
process.env.NODE_ENV  = 'test';

const request = require('supertest');
const app     = require('../auth');
const jwt     = require('jsonwebtoken');

const JWT_SECRET  = process.env.JWT_SECRET  || 'aoe-unified-super-secret-change-in-prod';
const JWT_REFRESH = process.env.JWT_REFRESH_SECRET || 'aoe-refresh-secret-change-in-prod';

let counter = 0;
function uniq() {
  counter++;
  return `auth_t${Date.now()}_${counter}@ex.com`;
}

async function reg(emailOverride, pw) {
  const email    = emailOverride || uniq();
  const password = pw || 'SecurePass123';
  const res = await request(app).post('/auth/register').send({ email, password });
  return { res, email, password };
}

// ── Health ────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  test('200 status OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });

  test('body.service is auth', async () => {
    const res = await request(app).get('/health');
    expect(res.body.service).toBe('auth');
  });
});

// ── POST /auth/register ───────────────────────────────────────────────────────

describe('POST /auth/register — happy path', () => {
  test('201 on valid registration', async () => {
    const { res } = await reg();
    expect(res.status).toBe(201);
  });

  test('response has string token', async () => {
    const { res } = await reg();
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(10);
  });

  test('response has refresh_token', async () => {
    const { res } = await reg();
    expect(typeof res.body.refresh_token).toBe('string');
  });

  test('response has user object without password_hash', async () => {
    const { res } = await reg();
    expect(typeof res.body.user).toBe('object');
    expect(res.body.user.password_hash).toBeUndefined();
  });

  test('user email matches submitted email (lowercase)', async () => {
    const email = uniq();
    const { res } = await reg(email);
    expect(res.body.user.email).toBe(email.toLowerCase());
  });

  test('token is a valid JWT with email claim', async () => {
    const { res } = await reg();
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.email).toBeDefined();
    expect(decoded.sub).toBeDefined();
  });

  test('refresh_token is a valid JWT signed with refresh secret', async () => {
    const { res } = await reg();
    const decoded = jwt.verify(res.body.refresh_token, JWT_REFRESH);
    expect(decoded.sub).toBeDefined();
  });
});

describe('POST /auth/register — validation errors', () => {
  test('400 on missing email', async () => {
    const res = await request(app).post('/auth/register').send({ password: 'SecurePass123' });
    expect(res.status).toBe(400);
  });

  test('400 on missing password', async () => {
    const res = await request(app).post('/auth/register').send({ email: uniq() });
    expect(res.status).toBe(400);
  });

  test('400 on weak password (< 6 chars)', async () => {
    const res = await request(app).post('/auth/register').send({ email: uniq(), password: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/6 characters/i);
  });

  test('400 on invalid email format (no @)', async () => {
    const res = await request(app).post('/auth/register').send({ email: 'not-an-email', password: 'SecurePass123' });
    expect(res.status).toBe(400);
  });

  test('409 on duplicate email', async () => {
    const email = uniq();
    await reg(email);
    const res = await request(app).post('/auth/register').send({ email, password: 'SecurePass123' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });
});

// ── POST /auth/login ──────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  let email, password;

  beforeAll(async () => {
    email    = uniq();
    password = 'LoginTestPass99';
    await reg(email, password);
  });

  test('200 on valid credentials', async () => {
    const res = await request(app).post('/auth/login').send({ email, password });
    expect(res.status).toBe(200);
  });

  test('response has token and refresh_token', async () => {
    const res = await request(app).post('/auth/login').send({ email, password });
    expect(typeof res.body.token).toBe('string');
    expect(typeof res.body.refresh_token).toBe('string');
  });

  test('user object returned without password_hash', async () => {
    const res = await request(app).post('/auth/login').send({ email, password });
    expect(res.body.user).toBeDefined();
    expect(res.body.user.password_hash).toBeUndefined();
  });

  test('401 on wrong password', async () => {
    const res = await request(app).post('/auth/login').send({ email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  test('401 on unknown email', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'nobody_xyz@test.com', password });
    expect(res.status).toBe(401);
  });

  test('400 on missing email', async () => {
    const res = await request(app).post('/auth/login').send({ password });
    expect(res.status).toBe(400);
  });

  test('400 on missing password', async () => {
    const res = await request(app).post('/auth/login').send({ email });
    expect(res.status).toBe(400);
  });

  test('400 on empty body', async () => {
    const res = await request(app).post('/auth/login').send({});
    expect(res.status).toBe(400);
  });
});

// ── GET /auth/verify ──────────────────────────────────────────────────────────

describe('GET /auth/verify', () => {
  let token;

  beforeAll(async () => {
    const { res } = await reg();
    token = res.body.token;
  });

  test('200 with valid bearer token', async () => {
    const res = await request(app).get('/auth/verify').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  test('verify response has user with email', async () => {
    const res = await request(app).get('/auth/verify').set('Authorization', `Bearer ${token}`);
    expect(res.body.user.email).toBeDefined();
  });

  test('401 without any token', async () => {
    const res = await request(app).get('/auth/verify');
    expect(res.status).toBe(401);
  });

  test('401 with garbage token', async () => {
    const res = await request(app).get('/auth/verify').set('Authorization', 'Bearer garbage.token.here');
    expect(res.status).toBe(401);
  });

  test('401 with expired token', async () => {
    const expired = jwt.sign({ sub: 9999, email: 'x@x.com' }, JWT_SECRET, { expiresIn: -1 });
    const res = await request(app).get('/auth/verify').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────

describe('POST /auth/logout', () => {
  test('200 on logout with valid token', async () => {
    const { res: regRes } = await reg();
    const res = await request(app).post('/auth/logout').set('Authorization', `Bearer ${regRes.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('logged_out');
  });

  test('blacklisted token rejected on /auth/verify after logout', async () => {
    const { res: regRes } = await reg();
    const tok = regRes.body.token;
    await request(app).post('/auth/logout').set('Authorization', `Bearer ${tok}`);
    const verRes = await request(app).get('/auth/verify').set('Authorization', `Bearer ${tok}`);
    expect(verRes.status).toBe(401);
  });

  test('blacklisted token rejected on second logout attempt', async () => {
    const { res: regRes } = await reg();
    const tok = regRes.body.token;
    await request(app).post('/auth/logout').set('Authorization', `Bearer ${tok}`);
    const res2 = await request(app).post('/auth/logout').set('Authorization', `Bearer ${tok}`);
    expect(res2.status).toBe(401);
  });

  test('401 on logout without token', async () => {
    const res = await request(app).post('/auth/logout');
    expect(res.status).toBe(401);
  });
});

// ── POST /auth/refresh ────────────────────────────────────────────────────────

describe('POST /auth/refresh', () => {
  let refreshToken;

  beforeAll(async () => {
    const { res } = await reg();
    refreshToken = res.body.refresh_token;
  });

  test('200 with valid refresh_token', async () => {
    const res = await request(app).post('/auth/refresh').send({ refresh_token: refreshToken });
    expect(res.status).toBe(200);
  });

  test('response has new access token', async () => {
    const res = await request(app).post('/auth/refresh').send({ refresh_token: refreshToken });
    expect(typeof res.body.token).toBe('string');
  });

  test('response has new refresh_token', async () => {
    const res = await request(app).post('/auth/refresh').send({ refresh_token: refreshToken });
    expect(typeof res.body.refresh_token).toBe('string');
  });

  test('400 on missing refresh_token', async () => {
    const res = await request(app).post('/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  test('401 on invalid refresh_token', async () => {
    const res = await request(app).post('/auth/refresh').send({ refresh_token: 'bad.token.here' });
    expect(res.status).toBe(401);
  });

  test('401 on expired refresh_token', async () => {
    const expired = jwt.sign({ sub: 9999, email: 'x@x.com' }, JWT_REFRESH, { expiresIn: -1 });
    const res = await request(app).post('/auth/refresh').send({ refresh_token: expired });
    expect(res.status).toBe(401);
  });
});

// ── POST /referral/create ─────────────────────────────────────────────────────

describe('POST /referral/create', () => {
  let token;

  beforeAll(async () => {
    const { res } = await reg();
    token = res.body.token;
  });

  test('201 on valid creation', async () => {
    const res = await request(app)
      .post('/referral/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ referred_email: uniq(), reward_credits: 100 });
    expect(res.status).toBe(201);
  });

  test('response has alphanumeric code', async () => {
    const res = await request(app)
      .post('/referral/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ referred_email: uniq() });
    expect(typeof res.body.code).toBe('string');
    expect(res.body.code.length).toBeGreaterThan(0);
  });

  test('400 on missing referred_email', async () => {
    const res = await request(app)
      .post('/referral/create')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('401 without auth token', async () => {
    const res = await request(app)
      .post('/referral/create')
      .send({ referred_email: uniq() });
    expect(res.status).toBe(401);
  });
});

// ── POST /referral/claim ──────────────────────────────────────────────────────

describe('POST /referral/claim', () => {
  let referrerToken;

  beforeAll(async () => {
    const { res } = await reg();
    referrerToken = res.body.token;
  });

  async function makeCode(referredEmail, credits) {
    const res = await request(app)
      .post('/referral/create')
      .set('Authorization', `Bearer ${referrerToken}`)
      .send({ referred_email: referredEmail, reward_credits: credits || 50 });
    return res.body.code;
  }

  test('200 on valid claim', async () => {
    const referred = uniq();
    const code = await makeCode(referred);
    const res = await request(app).post('/referral/claim').send({ code, email: referred });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('claimed');
  });

  test('response has reward_credits', async () => {
    const referred = uniq();
    const code = await makeCode(referred, 75);
    const res = await request(app).post('/referral/claim').send({ code, email: referred });
    expect(typeof res.body.reward_credits).toBe('number');
  });

  test('404 on double-claim (already claimed)', async () => {
    const referred = uniq();
    const code = await makeCode(referred);
    await request(app).post('/referral/claim').send({ code, email: referred });
    const res2 = await request(app).post('/referral/claim').send({ code, email: referred });
    expect(res2.status).toBe(404);
  });

  test('400 on missing code', async () => {
    const res = await request(app).post('/referral/claim').send({ email: uniq() });
    expect(res.status).toBe(400);
  });

  test('400 on missing email', async () => {
    const referred = uniq();
    const code = await makeCode(referred);
    const res = await request(app).post('/referral/claim').send({ code });
    expect(res.status).toBe(400);
  });

  test('404 on nonexistent code', async () => {
    const res = await request(app).post('/referral/claim').send({ code: 'FAKE0000', email: uniq() });
    expect(res.status).toBe(404);
  });

  test('403 when email does not match referral target', async () => {
    const referred = uniq();
    const code = await makeCode(referred);
    const res = await request(app).post('/referral/claim').send({ code, email: uniq() });
    expect(res.status).toBe(403);
  });
});

// ── 404 fallback ──────────────────────────────────────────────────────────────

describe('404 fallback', () => {
  test('unknown route returns 404', async () => {
    const res = await request(app).get('/auth/doesnotexist');
    expect(res.status).toBe(404);
  });
});
