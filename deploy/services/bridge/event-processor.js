// ─────────────────────────────────────────────────────────────────────────────
// event-processor.js — autonomous token bridge backed by Supabase.
//
// Replaces the Redis-based variant: no Redis, no pg pool. Uses the shared
// Supabase service-role client (lib/supabase.js) and the claim_events()
// Postgres RPC for competing-consumer semantics (SELECT … FOR UPDATE SKIP
// LOCKED inside a SQL function, atomically flipping rows from 'pending' to
// 'claimed').
//
// Flow per tick:
//   1. RPC claim_events(limit=BATCH) — atomically claim up to N rows.
//   2. For each event, build a distribution plan:
//        • primary credit to target_user_id
//        • upline commissions cascade via user_closure up to commissionRates.length
//   3. Validate each credit against the target's 24h net-flow cap (net_flow RPC).
//   4. SHADOW=1 → log plan, mark event processed, insert no ledger rows.
//      SHADOW=0 → INSERT one token_ledger row per plan entry, with a SHA256
//      checksum chain binding each row to its predecessor. Ledger trigger
//      updates token_balances automatically.
//   5. On any error → move the event into event_dead_letter and mark failed.
//
// Run as a PM2 app (see ecosystem entry ai-os-bridge below) or via:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... SHADOW=1 \
//   node deploy/services/bridge/event-processor.js
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const crypto = require('crypto');
const path = require('path');

// Load .env from project root BEFORE importing lib/supabase.js, otherwise
// SUPABASE_URL / SUPABASE_SERVICE_KEY read as empty and the client is
// marked "unconfigured" → process.exit(1) → PM2 restart loop.
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
} catch (_) { /* dotenv optional — env may be supplied directly */ }

// Prefer the project's shared client so env/config stays centralised.
const { supabase, isConfigured } =
  require(path.resolve(__dirname, '../../../lib/supabase.js'));

if (!isConfigured || !supabase) {
  console.error('[bridge] Supabase not configured. Set SUPABASE_URL + SUPABASE_SERVICE_KEY.');
  process.exit(1);
}

const SHADOW = process.env.SHADOW === '1' || process.env.SHADOW === 'true';
const BATCH  = Number(process.env.BRIDGE_BATCH || 10);
const TICK   = Number(process.env.BRIDGE_TICK_MS || 2000);
const COMMISSION_RATES =
  (process.env.COMMISSION_RATES || '0.10,0.05,0.025').split(',').map(Number);

// Banking-grade net-flow caps per 24h, by user tier. Tier is read from
// public.users.plan ('visitor'|'pro'|'enterprise') — mapped to 1/2/3.
const TIER_CAP_24H = { 1: 10_000, 2: 100_000, 3: 1_000_000 };
const PLAN_TO_TIER = { visitor: 1, free: 1, pro: 2, enterprise: 3, superadmin: 3 };

let shuttingDown = false;

// ── distribution planning ───────────────────────────────────────────────────
async function uplines(userId, maxDepth) {
  const { data, error } = await supabase
    .from('user_closure')
    .select('ancestor_id, depth')
    .eq('descendant_id', userId)
    .gte('depth', 1)
    .lte('depth', maxDepth)
    .order('depth', { ascending: true });
  if (error) throw new Error('uplines: ' + error.message);
  return data || [];
}

function buildPlan(evt) {
  const plan = [{
    event_type:     evt.event_type,
    source_user_id: evt.source_user_id ?? null,
    target_user_id: evt.target_user_id,
    amount:         Number(evt.amount),
    currency:       evt.currency || 'AIOS',
    payload:        { ...(evt.payload || {}), role: 'primary', event_id: evt.id },
  }];
  return plan;
}

async function appendUplines(plan, evt) {
  const ups = await uplines(evt.target_user_id, COMMISSION_RATES.length);
  for (const u of ups) {
    const rate = COMMISSION_RATES[u.depth - 1] ?? 0;
    if (rate <= 0) continue;
    const share = Number((Number(evt.amount) * rate).toFixed(8));
    if (share === 0) continue;
    plan.push({
      event_type:     evt.event_type + '.upline',
      source_user_id: evt.target_user_id,
      target_user_id: u.ancestor_id,
      amount:         share,
      currency:       evt.currency || 'AIOS',
      payload:        { ...(evt.payload || {}), role: 'upline', depth: u.depth, event_id: evt.id },
    });
  }
  return plan;
}

// ── tier cap check ──────────────────────────────────────────────────────────
async function getTier(userId) {
  const { data, error } = await supabase
    .from('users').select('plan').eq('id', userId).maybeSingle();
  if (error) throw new Error('getTier: ' + error.message);
  if (!data) return 1;
  return PLAN_TO_TIER[(data.plan || 'visitor').toLowerCase()] ?? 1;
}

async function net24h(userId) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.rpc('net_flow', {
    p_user: userId, p_since: since,
  });
  if (error) throw new Error('net_flow: ' + error.message);
  return Number(data) || 0;
}

async function canCredit(userId, delta) {
  const [tier, flow] = await Promise.all([getTier(userId), net24h(userId)]);
  const cap = TIER_CAP_24H[tier] ?? 0;
  return (flow + Number(delta)) <= cap;
}

// ── checksum chain ──────────────────────────────────────────────────────────
function canonical(row) {
  return JSON.stringify({
    t: row.event_type, s: row.source_user_id, d: row.target_user_id,
    a: String(row.amount), c: row.currency, p: row.payload ?? {},
  });
}
function sha256(prev, row) {
  const h = crypto.createHash('sha256');
  h.update(prev || ''); h.update('\n'); h.update(canonical(row));
  return h.digest('hex');
}

async function lastChecksum() {
  const { data, error } = await supabase
    .from('token_ledger').select('checksum')
    .order('id', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error('lastChecksum: ' + error.message);
  return data?.checksum ?? null;
}

// ── main: process one event ─────────────────────────────────────────────────
async function processEvent(evt) {
  if (!evt.target_user_id || !evt.amount) {
    throw new Error('event missing target_user_id or amount');
  }

  let plan = buildPlan(evt);
  plan = await appendUplines(plan, evt);

  // Tier-cap check for every credit in the plan.
  for (const row of plan) {
    if (!(await canCredit(row.target_user_id, row.amount))) {
      throw new Error(`tier cap exceeded for ${row.target_user_id}`);
    }
  }

  if (SHADOW) {
    console.log(`[bridge][SHADOW] event=${evt.id} plan=${plan.length} entries:`,
      plan.map(p => ({ to: p.target_user_id, amt: p.amount, role: p.payload.role })));
    return plan.length;
  }

  // Live: insert ledger rows with chained checksums. We can't get BEGIN/COMMIT
  // atomicity over the Supabase REST client, so we rely on the ledger trigger
  // to maintain balance consistency; chain integrity is per-row.
  let prev = await lastChecksum();
  let inserted = 0;
  for (const row of plan) {
    const sum = sha256(prev, row);
    const { error } = await supabase.from('token_ledger').insert({
      event_type: row.event_type,
      source_user_id: row.source_user_id,
      target_user_id: row.target_user_id,
      amount: row.amount,
      currency: row.currency,
      payload: row.payload,
      prev_checksum: prev,
      checksum: sum,
    });
    if (error) throw new Error('ledger insert: ' + error.message);
    prev = sum;
    inserted++;
  }
  return inserted;
}

// ── queue drain ─────────────────────────────────────────────────────────────
async function tick() {
  const { data: claimed, error } = await supabase.rpc('claim_events', { p_limit: BATCH });
  if (error) {
    console.error('[bridge] claim_events:', error.message);
    return 0;
  }
  if (!claimed || !claimed.length) return 0;

  for (const evt of claimed) {
    try {
      const n = await processEvent(evt);
      await supabase.from('ai_os_events')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('id', evt.id);
      console.log(`[bridge] event=${evt.id} type=${evt.event_type} entries=${n}`);
    } catch (e) {
      console.error(`[bridge] event=${evt.id} failed:`, e.message);
      await supabase.from('event_dead_letter').insert({
        source_event_id: evt.id,
        payload: evt,
        error: e.message,
        retries: evt.retries ?? 0,
      });
      await supabase.from('ai_os_events')
        .update({ status: 'failed', error: e.message })
        .eq('id', evt.id);
    }
  }
  return claimed.length;
}

// ── loop + lifecycle ────────────────────────────────────────────────────────
async function loop() {
  while (!shuttingDown) {
    const t0 = Date.now();
    let processed = 0;
    try { processed = await tick(); }
    catch (e) { console.error('[bridge] tick fatal:', e.message); }

    const elapsed = Date.now() - t0;
    // If the batch was full, don't wait — there might be more backlog.
    const wait = (processed === BATCH) ? 0 : Math.max(0, TICK - elapsed);
    if (wait) await new Promise(r => setTimeout(r, wait));
  }
}

function stop(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[bridge] ${signal} — finishing in-flight tick and exiting`);
}
process.on('SIGINT',  () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('message', (m) => { if (m && m.type === 'shutdown') stop('shutdown'); });

console.log(`[bridge] Supabase-backed processor starting. shadow=${SHADOW ? 'ON' : 'OFF'} batch=${BATCH} tickMs=${TICK}`);
if (process.send) process.send('ready');
loop().catch((e) => { console.error('[bridge] fatal:', e); process.exit(1); });
