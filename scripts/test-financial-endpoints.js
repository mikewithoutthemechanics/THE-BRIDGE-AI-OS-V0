/**
 * Full test of ALL revenue + treasury endpoints.
 * Hits every financial API and reports status.
 *
 * Usage: node scripts/test-financial-endpoints.js [base_url]
 * Default base: http://localhost:8080
 */
'use strict';

require('dotenv').config();

const BASE = process.argv[2] || 'http://localhost:8080';
const ADMIN_SECRET = process.env.BRIDGE_INTERNAL_SECRET;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

let pass = 0, fail = 0, skip = 0;
const results = [];

async function test(method, path, opts = {}) {
  const url = BASE + path;
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const label = `${method.toUpperCase().padEnd(5)} ${path}`;

  try {
    const fetchOpts = { method, headers, signal: AbortSignal.timeout(8000) };
    if (opts.body) fetchOpts.body = JSON.stringify(opts.body);
    const res = await fetch(url, fetchOpts);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch (_) { json = null; }

    const ok = res.status < 500;
    if (ok) { pass++; } else { fail++; }
    const status = ok ? ' OK ' : 'FAIL';
    const detail = json?.ok !== undefined ? (json.ok ? 'ok:true' : `ok:false ${json.error || ''}`.slice(0, 50)) : `${res.status}`;
    console.log(`  [${status}] ${label} → ${res.status} ${detail}`);
    results.push({ path, method, status: res.status, ok, detail });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.code === 'ECONNREFUSED') {
      skip++;
      console.log(`  [SKIP] ${label} → ${e.code || e.name}`);
      results.push({ path, method, status: 0, ok: false, detail: e.code || e.name });
    } else {
      fail++;
      console.log(`  [FAIL] ${label} → ${e.message.slice(0, 60)}`);
      results.push({ path, method, status: 0, ok: false, detail: e.message.slice(0, 60) });
    }
  }
}

const adminHeaders = { 'x-bridge-secret': ADMIN_SECRET };
const tokenHeaders = { 'Authorization': `Bearer ${ADMIN_TOKEN}` };

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('FULL FINANCIAL ENDPOINT TEST');
  console.log(`Base: ${BASE}`);
  console.log('═══════════════════════════════════════════════════════\n');

  // ── Treasury ─────────────────────────────────────────────────
  console.log('── TREASURY ──────────────────────────────────────────');
  await test('GET', '/api/treasury');
  await test('GET', '/api/treasury/status');
  await test('GET', '/api/treasury/ledger');
  await test('GET', '/api/treasury/full');
  await test('GET', '/api/treasury/state');
  await test('GET', '/api/treasury/wallet');
  await test('GET', '/api/treasury/eth/address');
  await test('GET', '/api/treasury/eth/balance');
  await test('GET', '/api/treasury/circuit-breaker', { headers: adminHeaders });

  // ── Revenue ──────────────────────────────────────────────────
  console.log('\n── REVENUE ───────────────────────────────────────────');
  await test('GET', '/api/revenue/status');
  await test('GET', '/api/revenue/summary');
  await test('GET', '/api/revenue/streams');
  await test('GET', '/api/revenue/rails');

  // ── BRDG Token & DeFi ────────────────────────────────────────
  console.log('\n── BRDG TOKEN & DEFI ─────────────────────────────────');
  await test('GET', '/api/brdg/price');
  await test('GET', '/api/brdg/token');
  await test('GET', '/api/brdg/vault');
  await test('GET', '/api/dex/pairs');
  await test('GET', '/api/dex/pools');

  // ── Plans & Checkout ─────────────────────────────────────────
  console.log('\n── PLANS & CHECKOUT ──────────────────────────────────');
  await test('GET', '/api/plans');

  // ── Economy ──────────────────────────────────────────────────
  console.log('\n── ECONOMY ───────────────────────────────────────────');
  await test('GET', '/api/economy/full');
  await test('GET', '/api/economy/balances');
  await test('GET', '/api/economy/stats');
  await test('GET', '/api/economy/flow');
  await test('GET', '/api/economy/tasks');
  await test('GET', '/api/marketplace/tasks');

  // ── Admin Treasury ───────────────────────────────────────────
  console.log('\n── ADMIN ─────────────────────────────────────────────');
  await test('GET', '/api/admin/withdraw/audit', { headers: adminHeaders });
  await test('GET', '/api/admin/payouts', { headers: adminHeaders });
  await test('GET', '/api/withdraw/rails');

  // ── Affiliate ────────────────────────────────────────────────
  console.log('\n── AFFILIATE ─────────────────────────────────────────');
  await test('GET', '/api/affiliate/partners');
  await test('GET', '/api/affiliate/logistics');
  await test('GET', '/api/affiliate/program');
  await test('GET', '/api/affiliate/leaderboard');
  await test('GET', '/api/affiliate/dashboard');
  await test('GET', '/api/affiliate/payouts');
  await test('GET', '/api/affiliate/creatives');
  await test('GET', '/api/affiliate/stats');

  // ── Proofs & Verification ────────────────────────────────────
  console.log('\n── PROOFS & VERIFICATION ─────────────────────────────');
  await test('GET', '/api/proofs/payments');
  await test('GET', '/api/proofs/diagnose');
  await test('GET', '/api/verify/chain');

  // ── Frontend Pages ───────────────────────────────────────────
  console.log('\n── FRONTEND PAGES ────────────────────────────────────');
  await test('GET', '/admin.html');
  await test('GET', '/admin-revenue.html');
  await test('GET', '/admin-withdraw.html');
  await test('GET', '/admin-command.html');
  await test('GET', '/treasury-dashboard.html');
  await test('GET', '/aoe-dashboard.html');
  await test('GET', '/executive-dashboard.html');
  await test('GET', '/affiliate.html');

  // ── Summary ──────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`RESULTS: ${pass} passed, ${fail} failed, ${skip} skipped`);
  console.log(`Total endpoints tested: ${pass + fail + skip}`);
  if (fail > 0) {
    console.log('\nFailed endpoints:');
    results.filter(r => !r.ok && r.status !== 0).forEach(r => console.log(`  ${r.method} ${r.path} → ${r.status} ${r.detail}`));
  }
  if (skip > 0) {
    console.log(`\n${skip} skipped (server not reachable at ${BASE})`);
  }
  console.log('═══════════════════════════════════════════════════════');
}

main();
