#!/usr/bin/env node
/**
 * migrate-sqlite-to-supabase.js
 *
 * Moves all existing data from local SQLite databases into Supabase.
 * Idempotent — safe to run multiple times (uses upsert with onConflict).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/migrate-sqlite-to-supabase.js
 */

const path = require('path');
const Database = require('better-sqlite3');
const { createClient } = require('@supabase/supabase-js');

// ── Supabase client ──────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://sdkysuvmtqjqopmdpvoz.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNka3lzdXZtdHFqcW9wbWRwdm96Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY4NTgzNCwiZXhwIjoyMDkxMjYxODM0fQ.3dCkxsaCPMjN88h3EftSpAfTmU0ECOspXHqT3yAjGX0'
);

const ROOT = path.resolve(__dirname, '..');
const BATCH_SIZE = 100;

// ── Helpers ──────────────────────────────────────────────────────────

function openDb(relPath) {
  const full = path.join(ROOT, relPath);
  try {
    return new Database(full, { readonly: true });
  } catch (err) {
    console.warn(`  [SKIP] Cannot open ${relPath}: ${err.message}`);
    return null;
  }
}

function readAll(db, table) {
  try {
    return db.prepare(`SELECT * FROM ${table}`).all();
  } catch (err) {
    console.warn(`  [SKIP] Cannot read ${table}: ${err.message}`);
    return [];
  }
}

/** Split array into chunks of `size`. */
function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/** Safely parse a JSON string; return the original value if it fails. */
function tryParseJson(val) {
  if (typeof val !== 'string') return val;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
}

/** Upsert rows into a Supabase table in batches. */
async function batchUpsert(table, rows, conflictColumns, label) {
  if (!rows.length) {
    console.log(`  ${label || table}: 0 rows — skipped`);
    return 0;
  }

  let inserted = 0;
  const batches = chunks(rows, BATCH_SIZE);

  for (let i = 0; i < batches.length; i++) {
    const { error } = await supabase
      .from(table)
      .upsert(batches[i], { onConflict: conflictColumns, ignoreDuplicates: false });

    if (error) {
      console.error(`  [ERROR] ${label || table} batch ${i + 1}/${batches.length}: ${error.message}`);
      // Log first row of failing batch for debugging
      console.error('  Sample row:', JSON.stringify(batches[i][0]).slice(0, 300));
    } else {
      inserted += batches[i].length;
    }
  }

  console.log(`  ${label || table}: ${inserted}/${rows.length} rows upserted (${batches.length} batch${batches.length > 1 ? 'es' : ''})`);
  return inserted;
}

// ── Migration functions ──────────────────────────────────────────────

/**
 * 1. Legacy users.db  ->  users table (with column mapping)
 */
async function migrateLegacyUsers() {
  console.log('\n[1/6] Legacy users.db -> users');
  const db = openDb('users.db');
  if (!db) return;

  // --- users ---
  const rawUsers = readAll(db, 'users');
  const mappedUsers = rawUsers.map(r => ({
    id:            String(r.id),
    email:         r.email,
    password_hash: r.password_hash,
    plan:          r.active ? 'visitor' : 'visitor',   // all legacy users become 'visitor'
    brdg_balance:  r.credits || 0,
    first_seen:    r.created_at || null,
    last_seen:     r.last_login || null,
    referral_code: r.referral_code || null,
    // Fields not present in legacy — leave as defaults
    name:           null,
    company:        null,
    oauth_provider: null,
    oauth_id:       null,
    funnel_stage:   'visitor',
    lead_score:     0,
    conversations:  0,
    role:           'user',
    totp_enabled:   false,
  }));
  await batchUpsert('users', mappedUsers, 'id', 'users (legacy)');

  // --- referrals ---
  const rawReferrals = readAll(db, 'referrals');
  const mappedReferrals = rawReferrals.map(r => ({
    // id is GENERATED ALWAYS AS IDENTITY — omit it so Postgres auto-generates
    referrer_id:    String(r.referrer_id),
    referred_email: r.referred_email,
    code:           r.code,
    claimed:        r.claimed === 1,           // INTEGER 0/1 -> boolean
    reward_credits: r.reward_credits || 0,
    created_at:     r.created_at || null,
    claimed_at:     r.claimed_at || null,
  }));
  // Referrals have auto-generated id — use insert (not upsert)
  // Deduplicate by referred_email to avoid re-inserting on reruns
  if (mappedReferrals.length) {
    const { data: existing } = await supabase.from('referrals').select('referred_email');
    const existingEmails = new Set((existing || []).map(r => r.referred_email));
    const newReferrals = mappedReferrals.filter(r => !existingEmails.has(r.referred_email));
    if (newReferrals.length) {
      const batches = chunks(newReferrals, BATCH_SIZE);
      let inserted = 0;
      for (let i = 0; i < batches.length; i++) {
        const { error } = await supabase.from('referrals').insert(batches[i]);
        if (error) console.error(`  [ERROR] referrals batch ${i+1}: ${error.message}`);
        else inserted += batches[i].length;
      }
      console.log(`  referrals (legacy): ${inserted}/${newReferrals.length} rows inserted`);
    } else {
      console.log(`  referrals (legacy): ${mappedReferrals.length} rows — already migrated`);
    }
  } else {
    console.log('  referrals (legacy): 0 rows — skipped');
  }

  db.close();
}

/**
 * 2. data/agent-ledger.db  ->  agent_balances, agent_transactions
 */
async function migrateAgentLedger() {
  console.log('\n[2/6] data/agent-ledger.db -> agent_balances, agent_transactions');
  const db = openDb('data/agent-ledger.db');
  if (!db) return;

  // --- agent_balances ---
  const balances = readAll(db, 'agent_balances').map(r => ({
    agent_id:          r.agent_id,
    balance:           r.balance,
    earned_total:      r.earned_total,
    spent_total:       r.spent_total,
    escrowed:          r.escrowed,
    last_tx:           r.last_tx,
    fiat_revenue:      r.fiat_revenue,
    ap2_revenue:       r.ap2_revenue,
    affiliate_revenue: r.affiliate_revenue,
    fiat_cost:         r.fiat_cost,
  }));
  await batchUpsert('agent_balances', balances, 'agent_id', 'agent_balances');

  // --- agent_transactions ---
  const txns = readAll(db, 'agent_transactions').map(r => ({
    id:         r.id,
    from_agent: r.from_agent,
    to_agent:   r.to_agent,
    amount:     r.amount,
    fee:        r.fee,
    burn:       r.burn,
    type:       r.type,
    task_id:    r.task_id,
    memo:       r.memo,
    ts:         r.ts,
  }));
  await batchUpsert('agent_transactions', txns, 'id', 'agent_transactions');

  db.close();
}

/**
 * 3. data/agent-registry.db  ->  agents
 */
async function migrateAgentRegistry() {
  console.log('\n[3/6] data/agent-registry.db -> agents');
  const db = openDb('data/agent-registry.db');
  if (!db) return;

  const agents = readAll(db, 'agents').map(r => ({
    id:         r.id,
    name:       r.name,
    role:       r.role,
    layer:      r.layer,
    type:       r.type,
    source:     r.source,
    skills:     tryParseJson(r.skills),   // TEXT JSON -> jsonb
    status:     r.status,
    config:     tryParseJson(r.config),   // TEXT JSON -> jsonb
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
  await batchUpsert('agents', agents, 'id', 'agents');

  db.close();
}

/**
 * 4. data/ap2v3-memory.db  ->  agent_memory
 */
async function migrateAgentMemory() {
  console.log('\n[4/6] data/ap2v3-memory.db -> agent_memory');
  const db = openDb('data/ap2v3-memory.db');
  if (!db) return;

  const rows = readAll(db, 'agent_memory').map(r => ({
    // id is GENERATED ALWAYS AS IDENTITY — omit it
    session_id: r.session_id,
    agent_id:   r.agent_id,
    input:      r.input,
    output:     r.output,
    score:      r.score,
    tokens:     r.tokens,
    ts:         r.ts,
  }));
  // Insert (not upsert) since id is auto-generated
  if (rows.length) {
    const { data: existing } = await supabase.from('agent_memory').select('session_id, agent_id').limit(1000);
    const existingKeys = new Set((existing || []).map(r => r.session_id + ':' + r.agent_id));
    const newRows = rows.filter(r => !existingKeys.has(r.session_id + ':' + r.agent_id));
    if (newRows.length) {
      const { error } = await supabase.from('agent_memory').insert(newRows);
      if (error) console.error('  [ERROR] agent_memory:', error.message);
      else console.log(`  agent_memory: ${newRows.length} rows inserted`);
    } else {
      console.log(`  agent_memory: ${rows.length} rows — already migrated`);
    }
  } else {
    console.log('  agent_memory: 0 rows — skipped');
  }

  db.close();
}

/**
 * 5. task-market.db  ->  tasks_market
 */
async function migrateTaskMarket() {
  console.log('\n[5/6] task-market.db -> tasks_market');
  const db = openDb('task-market.db');
  if (!db) return;

  const rows = readAll(db, 'tasks_market').map(r => ({
    id:             r.id,
    poster_agent:   r.poster_agent,
    claimer_agent:  r.claimer_agent,
    title:          r.title,
    description:    r.description,
    reward_brdg:    r.reward_brdg,
    escrow_amount:  r.escrow_amount,
    status:         r.status,
    result:         r.result,
    source:         r.source,
    posted_at:      r.posted_at,
    claimed_at:     r.claimed_at,
    completed_at:   r.completed_at,
    settled_at:     r.settled_at,
  }));
  await batchUpsert('tasks_market', rows, 'id', 'tasks_market');

  db.close();
}

/**
 * 6. Verify: data/users.db (new schema) — should be empty, but migrate if not
 */
async function migrateNewUsers() {
  console.log('\n[6/6] data/users.db (new) -> users (if any rows exist)');
  const db = openDb('data/users.db');
  if (!db) return;

  const rows = readAll(db, 'users');
  if (!rows.length) {
    console.log('  users (new): 0 rows — skipped');
    db.close();
    return;
  }

  const mapped = rows.map(r => ({
    id:             r.id,
    email:          r.email,
    name:           r.name,
    company:        r.company,
    oauth_provider: r.oauth_provider,
    oauth_id:       r.oauth_id,
    password_hash:  r.password_hash,
    plan:           r.plan,
    brdg_balance:   r.brdg_balance,
    funnel_stage:   r.funnel_stage,
    lead_score:     r.lead_score,
    pain_points:    r.pain_points,
    pages_visited:  r.pages_visited,
    conversations:  r.conversations,
    last_page:      r.last_page,
    utm_source:     r.utm_source,
    first_seen:     r.first_seen,
    last_seen:      r.last_seen,
    api_key:        r.api_key,
    role:           r.role,
    totp_secret:    r.totp_secret,
    totp_backup_codes: r.totp_backup_codes,
    totp_enabled:   r.totp_enabled === 1,  // INTEGER 0/1 -> boolean
  }));
  await batchUpsert('users', mapped, 'id', 'users (new)');

  db.close();
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('=== SQLite -> Supabase Data Migration ===');
  console.log(`Supabase URL: ${process.env.SUPABASE_URL || 'https://sdkysuvmtqjqopmdpvoz.supabase.co'}`);
  console.log(`Batch size:   ${BATCH_SIZE}`);
  console.log(`Source root:  ${ROOT}`);

  const t0 = Date.now();

  await migrateLegacyUsers();
  await migrateAgentLedger();
  await migrateAgentRegistry();
  await migrateAgentMemory();
  await migrateTaskMarket();
  await migrateNewUsers();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== Migration complete in ${elapsed}s ===`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
