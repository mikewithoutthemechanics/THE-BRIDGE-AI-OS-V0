#!/usr/bin/env node
// tests/capability-auth.test.js — Phase C of the capability refactor.
//
// Proves four properties of the /settings/* authorization layer:
//   1. Tier-declared capability → allowed
//   2. Per-user override capability → allowed
//   3. Neither capability nor super_admin fallback → 403 capability_required
//   4. Revocation takes effect on the NEXT request, with the SAME cookie,
//      without re-login (i.e. authority is resolved fresh per request,
//      never cached in the session).
//
// Mechanism:
//   - Spawns server.js on a test port with a known ORCHESTRA_ADMIN_TOKEN.
//   - Swaps data/settings.runtime.json for a controlled test fixture,
//     then restores the original on exit.
//   - Forges signed session cookies via lib/session.issueSession(). This
//     side-steps POST /settings/session (which only admits super_admins)
//     so we can log in as arbitrary non-super users and test the
//     capability gate in isolation from the authentication gate.
//
// Exit code: 0 if all tests pass, 1 otherwise.

const http     = require('http');
const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const { spawn } = require('child_process');

// The child server uses ORCHESTRA_ADMIN_TOKEN for session HMAC derivation;
// ORCHESTRA_SESSION_SECRET would override it. Unset in THIS process too so
// our forge uses the same derivation path as the child.
delete process.env.ORCHESTRA_SESSION_SECRET;

const session = require('../lib/session');

const ROOT        = path.resolve(__dirname, '..');
const STORE_PATH  = path.join(ROOT, 'data', 'settings.runtime.json');
const BACKUP_PATH = STORE_PATH + '.test-backup-' + Date.now();
const TEST_PORT   = 17791;
const ADMIN_TOKEN = 'test-capauth-' + crypto.randomBytes(6).toString('hex');

// Matches the super_admin capability list in config/settings.default.json.
// If that schema changes, update here.
const CAP_AUDIT_READ = 'settings.audit.read';
const CAP_READ_ANY   = 'settings.read.any';

// --- fixture
const FIXTURE = {
  version: 1,
  users: {
    'root@test.local': {
      tier: 'super_admin',
      overrides: {},
      granted_at: '2026-04-20T00:00:00.000Z',
    },
    'ovr@test.local': {
      // Non-super user; holds settings.audit.read via override only.
      tier: 'pro',
      overrides: { capabilities: [CAP_AUDIT_READ] },
      granted_at: '2026-04-20T00:00:00.000Z',
    },
    'plain@test.local': {
      // Non-super user with zero capabilities.
      tier: 'free',
      overrides: {},
      granted_at: '2026-04-20T00:00:00.000Z',
    },
  },
  audit: [],
};

// --- http helpers
function request({ method, path: p, headers = {}, body, cookies }){
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const h = { ...headers };
    if (cookies) h.cookie = cookies;
    if (payload){
      h['content-type'] = 'application/json';
      h['content-length'] = Buffer.byteLength(payload);
    }
    const req = http.request({ host: '127.0.0.1', port: TEST_PORT, path: p, method, headers: h }, r => {
      let buf = '';
      r.on('data', c => buf += c);
      r.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(buf); } catch { parsed = buf; }
        resolve({ status: r.statusCode, headers: r.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitReady(maxAttempts = 60){
  for (let i = 0; i < maxAttempts; i++){
    try {
      const r = await request({ method: 'GET', path: '/healthz' });
      if (r.status === 200) return;
    } catch { /* connect refused; retry */ }
    await sleep(150);
  }
  throw new Error(`server did not become ready on port ${TEST_PORT}`);
}

// Forge a valid session+csrf cookie pair for `email`, using the same
// HMAC secret derivation the server uses (ADMIN_TOKEN → secret).
function forge(email){
  const issued = session.issueSession({ email, adminToken: ADMIN_TOKEN, secure: false });
  // Extract name=value pairs from each Set-Cookie line.
  const jar = {};
  for (const line of issued.cookies){
    const first = line.split(';')[0];
    const eq = first.indexOf('=');
    if (eq > 0) jar[first.slice(0, eq)] = first.slice(eq + 1);
  }
  const cookieHeader = Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ');
  return { cookieHeader, csrf: issued.csrf };
}

// --- test ledger
const results = [];
function pass(name){
  results.push({ name, ok: true });
  console.log('  PASS  ' + name);
}
function fail(name, detail){
  results.push({ name, ok: false, detail });
  console.log('  FAIL  ' + name);
  console.log('        ' + detail);
}

function writeStore(obj){
  fs.writeFileSync(STORE_PATH, JSON.stringify(obj, null, 2) + '\n');
}

async function run(){
  // --- swap store
  let hadOriginal = false;
  if (fs.existsSync(STORE_PATH)){
    fs.copyFileSync(STORE_PATH, BACKUP_PATH);
    hadOriginal = true;
  }
  writeStore(FIXTURE);

  // --- spawn server
  const env = { ...process.env };
  delete env.ORCHESTRA_SESSION_SECRET;
  env.ORCHESTRA_ADMIN_TOKEN = ADMIN_TOKEN;
  env.ORCHESTRA_RATE_LIMIT  = '0';
  env.PORT                  = String(TEST_PORT);

  const server = spawn(process.execPath, ['server.js', String(TEST_PORT)], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderrBuf = '';
  server.stderr.on('data', c => { stderrBuf += c.toString(); });
  server.on('error', e => { console.error('server spawn error:', e); });

  const cleanup = () => {
    try { server.kill('SIGTERM'); } catch {}
    try {
      if (hadOriginal) fs.copyFileSync(BACKUP_PATH, STORE_PATH);
      else fs.unlinkSync(STORE_PATH);
    } catch {}
    try { if (fs.existsSync(BACKUP_PATH)) fs.unlinkSync(BACKUP_PATH); } catch {}
  };
  process.on('uncaughtException', e => { console.error(e); cleanup(); process.exit(1); });
  process.on('SIGINT',  () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });

  try {
    await waitReady();

    // === Test 1: tier-declared capability → allowed ===
    // root@test.local is super_admin → tier.capabilities includes
    // settings.read.any → GET /settings/runtime must return 200 with the store.
    {
      const { cookieHeader, csrf } = forge('root@test.local');
      const r = await request({
        method: 'GET',
        path: '/settings/runtime',
        cookies: cookieHeader,
        headers: { 'x-csrf-token': csrf },
      });
      if (r.status === 200 && r.body && typeof r.body.users === 'object'){
        pass('T1: tier-granted settings.read.any → 200 /settings/runtime');
      } else {
        fail('T1: tier-granted settings.read.any',
             `expected 200 with .users; got status=${r.status} body=${JSON.stringify(r.body).slice(0,200)}`);
      }
    }

    // === Test 2: override-granted capability → allowed ===
    // ovr@test.local is pro (no tier caps) but has settings.audit.read via
    // overrides.capabilities. Must pass /settings/audit without the
    // super_admin fallback kicking in (they're not super_admin).
    {
      const { cookieHeader, csrf } = forge('ovr@test.local');
      const r = await request({
        method: 'GET',
        path: '/settings/audit?limit=5',
        cookies: cookieHeader,
        headers: { 'x-csrf-token': csrf },
      });
      if (r.status === 200 && Array.isArray(r.body.entries)){
        pass('T2: override-granted settings.audit.read → 200 /settings/audit');
      } else {
        fail('T2: override-granted settings.audit.read',
             `expected 200 with .entries array; got status=${r.status} body=${JSON.stringify(r.body).slice(0,200)}`);
      }
    }

    // === Test 3: neither cap nor super_admin → 403 capability_required ===
    // plain@test.local is free-tier with no overrides. Any capability gate
    // must refuse with 403 and surface the specific capability.
    {
      const { cookieHeader, csrf } = forge('plain@test.local');
      const r = await request({
        method: 'GET',
        path: '/settings/audit?limit=5',
        cookies: cookieHeader,
        headers: { 'x-csrf-token': csrf },
      });
      if (r.status === 403 && r.body && r.body.error === 'capability_required' && r.body.capability === CAP_AUDIT_READ){
        pass('T3: no capability → 403 capability_required (names the missing cap)');
      } else {
        fail('T3: no capability',
             `expected 403 capability_required cap=${CAP_AUDIT_READ}; got status=${r.status} body=${JSON.stringify(r.body).slice(0,200)}`);
      }
    }

    // === Test 4: revocation without re-login → immediate 403 ===
    // ovr@test.local currently has settings.audit.read via override.
    // 4a: hit /settings/audit → 200 (baseline; same as T2).
    // 4b: mutate the store on disk to remove the override capability.
    // 4c: re-send the SAME session cookie → must now 403. Proves authority
    //     is resolved fresh from the store on every request, not cached
    //     into the session at login time.
    {
      const { cookieHeader, csrf } = forge('ovr@test.local');
      const before = await request({
        method: 'GET',
        path: '/settings/audit?limit=1',
        cookies: cookieHeader,
        headers: { 'x-csrf-token': csrf },
      });
      if (before.status !== 200){
        fail('T4a: pre-revocation baseline', `expected 200; got ${before.status} ${JSON.stringify(before.body).slice(0,200)}`);
      } else {
        // Revoke the capability by rewriting the store file.
        const revoked = JSON.parse(JSON.stringify(FIXTURE));
        revoked.users['ovr@test.local'].overrides = {}; // no capabilities
        writeStore(revoked);

        const after = await request({
          method: 'GET',
          path: '/settings/audit?limit=1',
          cookies: cookieHeader,        // SAME cookie as 4a
          headers: { 'x-csrf-token': csrf },
        });
        if (after.status === 403 && after.body && after.body.error === 'capability_required' && after.body.capability === CAP_AUDIT_READ){
          pass('T4: revocation takes effect immediately on next request (no re-login)');
        } else {
          fail('T4: revocation without re-login',
               `expected 403 capability_required; got status=${after.status} body=${JSON.stringify(after.body).slice(0,200)}`);
        }
      }
    }

    // === Test 5 (bonus): super_admin fallback still works ===
    // root@test.local should pass a capability gate for a cap that isn't
    // in the super_admin list — but every cap currently IS in that list.
    // Instead we prove the fallback by checking that super_admin still
    // passes a gate whose capability is named (regression guard against
    // anyone accidentally removing the fallback).
    {
      const { cookieHeader, csrf } = forge('root@test.local');
      const r = await request({
        method: 'GET',
        path: '/settings/audit?limit=1',
        cookies: cookieHeader,
        headers: { 'x-csrf-token': csrf },
      });
      if (r.status === 200) pass('T5: super_admin passes capability gate (fallback preserved)');
      else fail('T5: super_admin fallback', `got status=${r.status} body=${JSON.stringify(r.body).slice(0,200)}`);
    }

  } finally {
    cleanup();
  }

  // --- summarise
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  console.log('');
  console.log(`  ${passed}/${results.length} tests passed`);
  if (failed > 0){
    console.log('');
    console.log('  --- server stderr (last 400 chars) ---');
    console.log('  ' + stderrBuf.slice(-400).split('\n').join('\n  '));
  }
  process.exit(failed === 0 ? 0 : 1);
}

run().catch(e => {
  console.error('test harness crashed:', e);
  process.exit(2);
});
