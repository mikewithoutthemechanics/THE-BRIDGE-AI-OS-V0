'use strict';

process.env.AUTH_PORT = '15001';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../auth');

const JWT_SECRET = process.env.JWT_SECRET || 'aoe-unified-super-secret-change-in-prod';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'aoe-refresh-secret-change-in-prod';

const SUPER_ADMIN_EMAIL = 'ryanpcowan@gmail.com';

function makeUnsignedOAuthToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.`;
}

async function loginAsSuperAdminViaOAuth() {
  const oauthToken = makeUnsignedOAuthToken({
    email: SUPER_ADMIN_EMAIL,
    name: 'Ryan P Cowan',
    sub: 'supa-test-super-admin-sub',
  });
  return request(app).post('/auth/google').send({ oauth_token: oauthToken });
}

describe('Super Admin identity enforcement', () => {
  test('login returns superadmin identity object regardless of persisted role state', async () => {
    const res = await loginAsSuperAdminViaOAuth();

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user).toMatchObject({
      email: SUPER_ADMIN_EMAIL,
      role: 'superadmin',
      plan: 'enterprise',
      tenant: 'root',
      permissions: ['*'],
    });
  });

  test('access token contains enforced superadmin claims', async () => {
    const res = await loginAsSuperAdminViaOAuth();

    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.token, JWT_SECRET);

    expect(payload.email).toBe(SUPER_ADMIN_EMAIL);
    expect(payload.role).toBe('superadmin');
    expect(payload.plan).toBe('enterprise');
    expect(payload.tenant).toBe('root');
    expect(payload.permissions).toEqual(['*']);
  });

  test('refresh token contains enforced superadmin claims', async () => {
    const res = await loginAsSuperAdminViaOAuth();

    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.refresh_token, JWT_REFRESH_SECRET);

    expect(payload.email).toBe(SUPER_ADMIN_EMAIL);
    expect(payload.type).toBe('refresh');
    expect(payload.role).toBe('superadmin');
    expect(payload.plan).toBe('enterprise');
    expect(payload.tenant).toBe('root');
    expect(payload.permissions).toEqual(['*']);
  });

  test('/auth/verify returns superadmin role and root tenant', async () => {
    const login = await loginAsSuperAdminViaOAuth();

    const verify = await request(app)
      .get('/auth/verify')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(verify.status).toBe(200);
    expect(verify.body.valid).toBe(true);
    expect(verify.body.user).toMatchObject({
      email: SUPER_ADMIN_EMAIL,
      role: 'superadmin',
      plan: 'enterprise',
      tenant: 'root',
      permissions: ['*'],
    });
  });

  test('/auth/me returns superadmin role and wildcard permissions', async () => {
    const login = await loginAsSuperAdminViaOAuth();

    const me = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(me.status).toBe(200);
    expect(me.body.ok).toBe(true);
    expect(me.body.user).toMatchObject({
      email: SUPER_ADMIN_EMAIL,
      role: 'superadmin',
      plan: 'enterprise',
      tenant: 'root',
      permissions: ['*'],
    });
  });
});
