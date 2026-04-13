#!/usr/bin/env node
/**
 * Bridge AI OS — Route Audit & Unit Tests
 * Tests all Vercel routes for correct status, content-type, and no /ui.html loops
 */

const BASE = 'https://aoe-unified-final.vercel.app';

const PAGE_ROUTES = [
  ['/apps',           'application'],
  ['/treasury-dash',  'BRIDGE AI OS'],
  ['/dashboard',      'BRIDGE AI OS'],
  ['/status',         'status'],
  ['/ban',            'BAN'],
  ['/ehsa',           'EHSA'],
  ['/supac',          'SUPAC'],
  ['/ubi',            'UBI'],
  ['/aid',            'AID'],
  ['/aurora',         'Aurora'],
  ['/twins',          'twin'],
  ['/executive',      'executive'],
  ['/face',           'face'],
  ['/hospital',       'hospital'],
  ['/rootedearth',    'Rooted'],
  ['/abaas',          'ABAAS'],
  ['/crm',            'CRM'],
  ['/invoicing',      'invoic'],
  ['/legal',          'legal'],
  ['/marketing',      'market'],
  ['/tickets',        'ticket'],
  ['/pricing',        'pric'],
  ['/leadgen',        'lead'],
  ['/control',        'control'],
  ['/registry',       'registry'],
  ['/agents',         'agent'],
  ['/topology',       'topology'],
  ['/docs',           'doc'],
  ['/landing',        'Bridge'],
  ['/sitemap',        'sitemap'],
  ['/affiliate',      'affiliate'],
  ['/governance',     'governance'],
  ['/auth-dashboard', 'auth'],
  ['/join',           'join'],
  ['/welcome',        'welcome'],
  ['/home',           'Bridge'],
  ['/settings',       'setting'],
  ['/marketplace',    'market'],
  ['/onboarding',     'Bridge'],
  ['/brand',          'brand'],
  ['/corporate',      'corporate'],
  ['/intelligence',   'intelligence'],
  ['/terminal',       'terminal'],
  ['/wallet',         'wallet'],
  ['/trading',        'trading'],
  ['/defi',           'defi'],
  ['/avatar',         'avatar'],
  ['/admin',          'admin'],
  ['/platforms',      'platform'],
  ['/bridge-home',    'bridge'],
  ['/command-center', 'command'],
  ['/infra',          'infra'],
  ['/twin-wall',      'twin'],
  ['/banks',          'bank'],
  ['/logs',           'log'],
  ['/payment',        'payment'],
];

const API_ROUTES = [
  ['/health',                   { status: 200, field: 'status' }],
  ['/skills',                   { status: 200, isArray: true }],
  ['/skills/definitions',       { status: 200, field: 'skills' }],
  ['/telemetry',                { status: 200, field: 'engine' }],
  ['/graph',                    { status: 200, contentType: 'image/svg+xml' }],
  ['/live-map',                 { status: 200, field: 'nodes' }],
  ['/treasury/summary',         { status: 200, field: 'total' }],
  ['/swarm/health',             { status: 200, field: 'ok' }],
  ['/econ/circuit-breaker',     { status: 200, field: 'state' }],
  ['/ubi/status',               { status: 200, field: 'pool_balance' }],
  ['/api/events/recent',        { status: 200, field: 'events' }],
];

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const WARN = '\x1b[33m⚠\x1b[0m';

let passed = 0, failed = 0, warned = 0;

async function testPage(path, bodyContains) {
  try {
    const res = await fetch(BASE + path, { redirect: 'follow' });
    const finalUrl = res.url;
    const body = await res.text();

    // Check for /ui.html loop
    if (finalUrl.includes('/ui.html') || finalUrl.endsWith('/ui')) {
      console.log(`${FAIL} PAGE  ${path.padEnd(22)} → LOOP to ${finalUrl}`);
      failed++;
      return;
    }

    if (res.status !== 200) {
      console.log(`${FAIL} PAGE  ${path.padEnd(22)} → HTTP ${res.status} (${finalUrl})`);
      failed++;
      return;
    }

    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) {
      console.log(`${WARN} PAGE  ${path.padEnd(22)} → wrong content-type: ${ct}`);
      warned++;
      return;
    }

    const bodyLower = body.toLowerCase();
    const keyword = bodyContains.toLowerCase();
    if (!bodyLower.includes(keyword)) {
      console.log(`${WARN} PAGE  ${path.padEnd(22)} → 200 OK but keyword "${bodyContains}" not found`);
      warned++;
      return;
    }

    console.log(`${PASS} PAGE  ${path.padEnd(22)} → 200 OK`);
    passed++;
  } catch (e) {
    console.log(`${FAIL} PAGE  ${path.padEnd(22)} → ERROR: ${e.message}`);
    failed++;
  }
}

async function testApi(path, opts) {
  try {
    const res = await fetch(BASE + path, { redirect: 'follow' });

    if (res.status !== opts.status) {
      console.log(`${FAIL} API   ${path.padEnd(28)} → HTTP ${res.status}`);
      failed++;
      return;
    }

    const ct = res.headers.get('content-type') || '';
    if (opts.contentType) {
      if (!ct.includes(opts.contentType)) {
        console.log(`${FAIL} API   ${path.padEnd(28)} → wrong content-type: ${ct} (expected ${opts.contentType})`);
        failed++;
      } else {
        console.log(`${PASS} API   ${path.padEnd(28)} → 200 ${opts.contentType} OK`);
        passed++;
      }
      return;
    }
    if (!ct.includes('application/json')) {
      console.log(`${WARN} API   ${path.padEnd(28)} → wrong content-type: ${ct}`);
      warned++;
      return;
    }

    const json = await res.json();
    if (opts.isArray && !Array.isArray(json)) {
      console.log(`${WARN} API   ${path.padEnd(28)} → expected array, got ${typeof json}`);
      warned++;
      return;
    }
    if (opts.field && json[opts.field] === undefined) {
      console.log(`${WARN} API   ${path.padEnd(28)} → missing field "${opts.field}" in response`);
      warned++;
      return;
    }

    console.log(`${PASS} API   ${path.padEnd(28)} → 200 JSON OK`);
    passed++;
  } catch (e) {
    console.log(`${FAIL} API   ${path.padEnd(28)} → ERROR: ${e.message}`);
    failed++;
  }
}

async function testGetStartedButton() {
  // Verify ui.html Get Started button goes to /auth-dashboard (not /welcome or /ui.html)
  try {
    const res = await fetch(BASE + '/ui.html');
    const body = await res.text();
    if (body.includes('href="/auth-dashboard"')) {
      console.log(`${PASS} BTN   /ui.html "Get Started"    → /auth-dashboard ✓`);
      passed++;
    } else if (body.includes('href="/welcome"')) {
      console.log(`${FAIL} BTN   /ui.html "Get Started"    → still /welcome (not fixed)`);
      failed++;
    } else {
      console.log(`${WARN} BTN   /ui.html "Get Started"    → href not found`);
      warned++;
    }
  } catch (e) {
    console.log(`${FAIL} BTN   /ui.html "Get Started"    → ERROR: ${e.message}`);
    failed++;
  }
}

async function run() {
  console.log(`\nBridge AI OS — Route Audit`);
  console.log(`Target: ${BASE}`);
  console.log(`${'─'.repeat(60)}\n`);

  console.log('── Page Routes ─────────────────────────────────────────\n');
  for (const [path, keyword] of PAGE_ROUTES) {
    await testPage(path, keyword);
  }

  console.log('\n── API Routes ──────────────────────────────────────────\n');
  for (const [path, opts] of API_ROUTES) {
    await testApi(path, opts);
  }

  console.log('\n── Button Checks ───────────────────────────────────────\n');
  await testGetStartedButton();

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Results: ${passed} passed  ${failed} failed  ${warned} warnings`);
  console.log('─'.repeat(60));

  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
