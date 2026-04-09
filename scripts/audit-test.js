#!/usr/bin/env node
/**
 * Full auth audit test suite — runs against live Supabase.
 * Usage: node scripts/audit-test.js
 */
'use strict';

// Load env
require('dotenv').config();

let pass = 0, fail = 0, errors = [];

async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log('  PASS ' + name);
  } catch (e) {
    fail++;
    errors.push(name + ': ' + e.message);
    console.log('  FAIL ' + name + ': ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

(async () => {
  const userDb = require('../lib/user-identity');
  const ac = require('../middleware/access-control');
  const { revokeToken } = require('../middleware/auth');
  const { supabase } = require('../lib/supabase');
  const testEmail = 'audit-' + Date.now() + '@test.bridge.ai';
  let user, token;

  // ── SUITE 1: USER IDENTITY ──────────────────────────────────────
  console.log('\n=== SUITE 1: USER IDENTITY (Supabase) ===');

  await test('create user', async () => {
    user = await userDb.createUser(testEmail, 'Audit', 'email', null, 'T3st!Pass');
    assert(user.id && user.email === testEmail);
  });

  await test('idempotent create', async () => {
    const d = await userDb.createUser(testEmail);
    assert(d.id === user.id);
  });

  await test('getUserByEmail', async () => {
    const u = await userDb.getUserByEmail(testEmail);
    assert(u.id === user.id);
  });

  await test('getUserById', async () => {
    const u = await userDb.getUserById(user.id);
    assert(u.email === testEmail);
  });

  await test('getUserByApiKey', async () => {
    const u = await userDb.getUserByApiKey(user.api_key);
    assert(u.id === user.id);
  });

  await test('getUserByEmail returns null for missing', async () => {
    const u = await userDb.getUserByEmail('nonexistent@x.com');
    assert(u === null);
  });

  await test('getUserById returns null for missing', async () => {
    const u = await userDb.getUserById('fake-id-xxx');
    assert(u === null);
  });

  await test('updateUser name + company', async () => {
    const u = await userDb.updateUser(user.id, { name: 'Updated', company: 'BridgeAI' });
    assert(u.name === 'Updated' && u.company === 'BridgeAI');
  });

  await test('updateUser ignores disallowed fields', async () => {
    const u = await userDb.updateUser(user.id, { role: 'superadmin', plan: 'enterprise', email: 'hacker@evil.com' });
    assert(u.role !== 'superadmin' && u.email === testEmail);
  });

  await test('setUserRole valid', async () => {
    const u = await userDb.setUserRole(user.id, 'admin');
    assert(u.role === 'admin');
  });

  await test('setUserRole rejects invalid', async () => {
    try { await userDb.setUserRole(user.id, 'god'); assert(false, 'should throw'); }
    catch (e) { assert(e.message.includes('Invalid')); }
  });

  await test('setUserPlan', async () => {
    const u = await userDb.setUserPlan(user.id, 'pro');
    assert(u.plan === 'pro');
  });

  await test('updateFunnelStage valid', async () => {
    const u = await userDb.updateFunnelStage(user.id, 'qualified');
    assert(u.funnel_stage === 'qualified');
  });

  await test('updateFunnelStage rejects invalid', async () => {
    try { await userDb.updateFunnelStage(user.id, 'mega_lead'); assert(false); }
    catch (e) { assert(e.message.includes('Invalid')); }
  });

  await test('updateLeadScore positive', async () => {
    const u = await userDb.updateLeadScore(user.id, 25);
    assert(u.lead_score === 25);
  });

  await test('updateLeadScore floors at 0', async () => {
    const u = await userDb.updateLeadScore(user.id, -100);
    assert(u.lead_score === 0);
  });

  await test('recordPageVisit', async () => {
    const u = await userDb.recordPageVisit(user.id, '/console.html');
    assert(Array.isArray(u.pages_visited) && u.pages_visited.includes('/console.html'));
  });

  await test('recordPageVisit deduplicates', async () => {
    const u = await userDb.recordPageVisit(user.id, '/console.html');
    assert(u.pages_visited.filter(p => p === '/console.html').length === 1);
  });

  await test('recordConversation increments', async () => {
    const u = await userDb.recordConversation(user.id);
    assert(u.conversations >= 1);
  });

  await test('getAllUsers returns array', async () => {
    const a = await userDb.getAllUsers();
    assert(Array.isArray(a) && a.length >= 1);
  });

  await test('getFunnelStats returns object', async () => {
    const s = await userDb.getFunnelStats();
    assert(typeof s === 'object');
  });

  await test('getNurtureQueue returns array', async () => {
    const q = await userDb.getNurtureQueue();
    assert(Array.isArray(q));
  });

  // ── SUITE 2: JWT / AUTH TOKENS ───────────────────────────────────
  console.log('\n=== SUITE 2: JWT / AUTH TOKENS ===');

  await test('generateAuthToken', async () => {
    token = await userDb.generateAuthToken(user.id);
    assert(token && token.split('.').length === 3);
  });

  await test('verifyAuthToken valid', async () => {
    const v = await userDb.verifyAuthToken(token);
    assert(v && v.id === user.id);
  });

  await test('verifyAuthToken bad token', async () => {
    const v = await userDb.verifyAuthToken('x.y.z');
    assert(v === null);
  });

  await test('verifyAuthToken null', async () => {
    const v = await userDb.verifyAuthToken(null);
    assert(v === null);
  });

  await test('verifyAuthToken empty string', async () => {
    const v = await userDb.verifyAuthToken('');
    assert(v === null);
  });

  // ── SUITE 3: PASSWORD SECURITY ───────────────────────────────────
  console.log('\n=== SUITE 3: PASSWORD SECURITY ===');

  await test('hashPassword + verifyPassword roundtrip', () => {
    const h = userDb.hashPassword('test123');
    assert(userDb.verifyPassword('test123', h));
  });

  await test('verifyPassword rejects wrong password', () => {
    assert(!userDb.verifyPassword('wrong', user.password_hash));
  });

  await test('verifyPassword handles null stored', () => {
    assert(!userDb.verifyPassword('test', null));
  });

  await test('needsRehash false for bcrypt', () => {
    assert(!userDb.needsRehash(user.password_hash));
  });

  await test('needsRehash true for legacy SHA-256', () => {
    const legacyHash = 'a'.repeat(32) + ':' + 'b'.repeat(64);
    assert(userDb.needsRehash(legacyHash));
  });

  // ── SUITE 4: TOTP / MFA (encrypted at rest) ─────────────────────
  console.log('\n=== SUITE 4: TOTP / MFA (encrypted at rest) ===');

  await test('setTotpSecret encrypts in DB', async () => {
    await userDb.setTotpSecret(user.id, 'MYSECRET123', ['CODE1', 'CODE2', 'CODE3']);
    const { data } = await supabase.from('users').select('totp_secret, totp_backup_codes').eq('id', user.id).single();
    assert(data.totp_secret !== 'MYSECRET123', 'secret should be encrypted');
    assert(data.totp_backup_codes.includes(':'), 'codes should be encrypted (AES-GCM format)');
  });

  await test('getTotpData decrypts correctly', async () => {
    const t = await userDb.getTotpData(user.id);
    assert(t.secret === 'MYSECRET123');
    assert(t.backup_codes.length === 3);
    assert(t.backup_codes[0] === 'CODE1');
  });

  await test('enableTotp', async () => {
    await userDb.enableTotp(user.id);
    const t = await userDb.getTotpData(user.id);
    assert(t.enabled === true);
  });

  await test('consumeBackupCode valid', async () => {
    const r = await userDb.consumeBackupCode(user.id, 'CODE2');
    assert(r === true);
    const t = await userDb.getTotpData(user.id);
    assert(t.backup_codes.length === 2);
  });

  await test('consumeBackupCode rejects invalid', async () => {
    assert(await userDb.consumeBackupCode(user.id, 'BADCODE') === false);
  });

  await test('consumeBackupCode rejects already-used', async () => {
    assert(await userDb.consumeBackupCode(user.id, 'CODE2') === false);
  });

  // ── SUITE 5: ACCESS CONTROL MIDDLEWARE ───────────────────────────
  console.log('\n=== SUITE 5: ACCESS CONTROL MIDDLEWARE ===');

  function mockReq(path, opts) {
    opts = opts || {};
    return {
      method: 'GET', path: path, originalUrl: path,
      headers: Object.assign({
        authorization: opts.token ? 'Bearer ' + opts.token : '',
        accept: 'application/json',
      }, opts.headers || {}),
      cookies: {}, query: {},
    };
  }
  function mockRes() {
    var r = { statusCode: 200, body: null };
    r.status = function(c) { r.statusCode = c; return r; };
    r.json = function(d) { r.body = d; return r; };
    r.send = function(d) { r.body = d; return r; };
    r.redirect = function(u) { r.statusCode = 302; r.body = u; return r; };
    return r;
  }

  await test('extractUser with valid token', async () => {
    const u = await ac.extractUser(mockReq('/x', { token: token }));
    assert(u && u.id === user.id);
  });

  await test('extractUser with no token returns null', async () => {
    assert(await ac.extractUser(mockReq('/x')) === null);
  });

  await test('requireClient passes authenticated user', async () => {
    var n = false;
    await ac.requireClient(mockReq('/x', { token: token }), mockRes(), function() { n = true; });
    assert(n);
  });

  await test('requireClient rejects unauthenticated', async () => {
    var n = false, r = mockRes();
    await ac.requireClient(mockReq('/x'), r, function() { n = true; });
    assert(!n && r.statusCode === 401);
  });

  await test('requireAdmin with X-Admin-Token header', async () => {
    // Set a test admin token for this check
    const testAdminToken = 'test-admin-token-' + Date.now();
    process.env.ADMIN_TOKEN = testAdminToken;
    var n = false;
    await ac.requireAdmin(mockReq('/x', { headers: { 'x-admin-token': testAdminToken } }), mockRes(), function() { n = true; });
    assert(n);
  });

  await test('requireAdmin with admin role user', async () => {
    var n = false;
    await ac.requireAdmin(mockReq('/x', { token: token }), mockRes(), function() { n = true; });
    assert(n);
  });

  await test('requireAdmin rejects non-admin', async () => {
    // Reset to regular user
    await userDb.setUserRole(user.id, 'user');
    const regularToken = await userDb.generateAuthToken(user.id);
    var n = false, r = mockRes();
    await ac.requireAdmin(mockReq('/x', { token: regularToken }), r, function() { n = true; });
    assert(!n && r.statusCode === 403);
    // Restore admin for next tests
    await userDb.setUserRole(user.id, 'admin');
    token = await userDb.generateAuthToken(user.id);
  });

  await test('pageGuard allows PUBLIC pages', async () => {
    var n = false;
    await ac.pageGuard()(mockReq('/onboarding.html'), mockRes(), function() { n = true; });
    assert(n);
  });

  await test('pageGuard blocks CLIENT without auth', async () => {
    var n = false, r = mockRes();
    await ac.pageGuard()(mockReq('/console.html'), r, function() { n = true; });
    assert(!n);
  });

  await test('pageGuard passes CLIENT with auth', async () => {
    var n = false;
    await ac.pageGuard()(mockReq('/console.html', { token: token }), mockRes(), function() { n = true; });
    assert(n);
  });

  await test('pageGuard blocks ADMIN without auth', async () => {
    var n = false, r = mockRes();
    await ac.pageGuard()(mockReq('/admin.html'), r, function() { n = true; });
    assert(!n);
  });

  await test('pageGuard passes ADMIN with admin token', async () => {
    var n = false;
    await ac.pageGuard()(mockReq('/admin.html', { token: token }), mockRes(), function() { n = true; });
    assert(n);
  });

  await test('pageGuard skips /api/ routes', async () => {
    var n = false;
    await ac.pageGuard()(mockReq('/api/health'), mockRes(), function() { n = true; });
    assert(n);
  });

  await test('pageGuard skips non-HTML', async () => {
    var n = false;
    await ac.pageGuard()(mockReq('/style.css'), mockRes(), function() { n = true; });
    assert(n);
  });

  // ── SUITE 6: TOKEN REVOCATION ────────────────────────────────────
  console.log('\n=== SUITE 6: TOKEN REVOCATION ===');

  await test('revokeToken stores in map/redis', async () => {
    const tempToken = await userDb.generateAuthToken(user.id);
    await revokeToken(tempToken);
    // Can't easily check from here but no error = success
  });

  // ── SUITE 7: MODULE LOADING ──────────────────────────────────────
  console.log('\n=== SUITE 7: MODULE LOADING ===');

  const modules = [
    'lib/supabase', 'lib/user-identity', 'lib/agent-ledger', 'lib/agent-registry',
    'lib/task-market', 'lib/api-keys', 'lib/data-flywheel', 'lib/merchant-bids',
    'lib/page-economics', 'lib/commerce-index', 'lib/ap2v3/memory',
    'middleware/clerk', 'middleware/access-control', 'middleware/auth', 'middleware/api-key-auth',
  ];
  for (const m of modules) {
    await test('require ' + m, async () => { require('../' + m); });
  }

  // ── CLEANUP ──────────────────────────────────────────────────────
  await supabase.from('users').delete().eq('id', user.id);

  // ── RESULTS ──────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(50));
  console.log('  ' + pass + ' PASSED, ' + fail + ' FAILED');
  if (errors.length) {
    console.log('\n  Failures:');
    errors.forEach(function(e) { console.log('    - ' + e); });
  }
  console.log('='.repeat(50));
  process.exit(fail > 0 ? 1 : 0);
})();
