#!/usr/bin/env node
/**
 * deploy-affiliate-system.js
 *
 * Node port of deploy-affiliate-system.sh. Works on Windows where psql isn't
 * installed — uses the `pg` npm package + dotenv (same pattern as
 * scripts/apply-supabase-schema.js).
 *
 * Subcommands (identical semantics to the .sh version):
 *   check    verify env + files + DB connection (no writes)
 *   backup   snapshot affiliates table
 *   migrate  apply both migrations (idempotent; --force to override)
 *   verify   confirm schema landed
 *   seed     run scripts/seed-affiliates.js (--safe | --full | --dry required)
 *   status   read-only summary
 *   all      check → backup → migrate → verify (never seeds)
 *
 * Run:
 *   node scripts/deploy-affiliate-system.js check
 *   node scripts/deploy-affiliate-system.js all
 *   node scripts/deploy-affiliate-system.js seed --safe
 */

'use strict';

require('dotenv').config({ override: false });

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT         = path.resolve(__dirname, '..');
const MIGRATION_RECON   = path.join(REPO_ROOT, 'supabase', 'migrations', '20260420100000_affiliate_program_reconciliation.sql');
const MIGRATION_KIOSK   = path.join(REPO_ROOT, 'supabase', 'migrations', '20260420110000_affiliate_kiosk_marketplace.sql');
const SEED_SCRIPT       = path.join(REPO_ROOT, 'scripts', 'seed-affiliates.js');
const DEFAULT_COMPANY   = '00000000-0000-0000-0000-000000000001';
const BACKUP_SUFFIX     = new Date().toISOString().slice(0, 10).replace(/-/g, '');

const tty = process.stdout.isTTY;
const C = tty
  ? { r:'\x1b[31m', y:'\x1b[33m', g:'\x1b[32m', c:'\x1b[36m', d:'\x1b[2m', x:'\x1b[0m' }
  : { r:'',          y:'',          g:'',          c:'',          d:'',          x:'' };

const ts = () => new Date().toTimeString().slice(0, 8);
const log  = (m) => console.log(`${C.c}[${ts()}]${C.x} ${m}`);
const ok   = (m) => console.log(`${C.g}[ OK ]${C.x} ${m}`);
const warn = (m) => console.warn(`${C.y}[WARN]${C.x} ${m}`);
const dim  = (m) => console.log(`${C.d}${m}${C.x}`);
function fail(m) {
  console.error(`${C.r}[FAIL]${C.x} ${m}`);
  process.exit(1);
}

// ── DB helpers ─────────────────────────────────────────────────────────────

let _clientPromise = null;
async function getClient() {
  if (_clientPromise) return _clientPromise;

  const url = process.env.DATABASE_URL;
  if (!url) {
    fail('DATABASE_URL is not set in env (.env or shell).\n' +
         '       Get it from Supabase Dashboard → Settings → Database → Connection string (URI).\n' +
         '       Add it to c:/aoe-unified-final/.env or export before running.');
  }

  const { Client } = require('pg');
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  _clientPromise = client.connect().then(() => client);
  return _clientPromise;
}

async function closeClient() {
  if (!_clientPromise) return;
  try {
    const c = await _clientPromise;
    await c.end();
  } catch (_) { /* already closed */ }
}

async function q(sql, params) {
  const c = await getClient();
  const res = await c.query(sql, params);
  return res.rows;
}

async function qScalar(sql, params) {
  const rows = await q(sql, params);
  if (!rows.length) return null;
  const first = rows[0];
  return first[Object.keys(first)[0]];
}

// ── Subcommands ────────────────────────────────────────────────────────────

async function cmd_check() {
  log('Pre-flight checks');

  for (const f of [MIGRATION_RECON, MIGRATION_KIOSK, SEED_SCRIPT]) {
    if (!fs.existsSync(f)) fail(`Missing file: ${f}`);
  }
  ok('Migration and seed files present');

  if (!process.env.DATABASE_URL) {
    fail('DATABASE_URL not set (check .env or export it)');
  }
  ok(`DATABASE_URL set (ending …${process.env.DATABASE_URL.slice(-16)})`);

  log('Testing DB connection');
  const v = await qScalar('SELECT 1 AS x');
  if (v !== 1) fail('DB probe returned unexpected value');
  ok('DB connection OK');

  const runtime = [
    ['SUPABASE_URL',         'required for seed step'],
    ['SUPABASE_SERVICE_KEY', 'required for seed step'],
    ['JWT_SECRET',           'required at runtime for /api/affiliate/* auth'],
    ['ADMIN_TOKEN',          'required at runtime for /api/orders/:id/pay settlement'],
  ];
  for (const [k, why] of runtime) {
    if (!process.env[k]) warn(`${k} not set — ${why}`);
    else ok(`${k} set`);
  }

  ok('Pre-flight complete');
}

async function cmd_backup() {
  log('Checking if affiliates table exists');
  const has = await qScalar(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='affiliates')`
  );
  if (!has) {
    warn('affiliates table does not exist yet — nothing to back up. Skipping.');
    return;
  }

  const backupTable = `affiliates_backup_${BACKUP_SUFFIX}`;
  const exists = await qScalar(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name=$1)`,
    [backupTable]
  );
  if (exists) {
    warn(`Backup table ${backupTable} already exists — leaving it alone`);
    return;
  }

  log(`Creating backup table ${backupTable}`);
  const c = await getClient();
  // Table identifier can't be parameterized — sanitize hard.
  if (!/^affiliates_backup_\d{8}$/.test(backupTable)) fail('Backup name guard failed');
  await c.query(`CREATE TABLE ${backupTable} AS SELECT * FROM affiliates`);

  const count = await qScalar(`SELECT COUNT(*) FROM ${backupTable}`);
  ok(`Backed up ${count} affiliate rows into ${backupTable}`);
  dim(`To drop once stable: DROP TABLE ${backupTable};`);
}

async function cmd_migrate(flags) {
  const force = flags.includes('--force');

  const hasRecon = await qScalar(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='affiliates' AND column_name='bridge_user_id')`
  );
  const hasKiosk = await qScalar(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='affiliate_kiosks')`
  );

  if (hasRecon && hasKiosk && !force) {
    warn('Both migrations appear already applied (affiliates.bridge_user_id + affiliate_kiosks exist).');
    dim('Re-run with --force to execute them again anyway (safe: both are idempotent).');
    return;
  }

  const c = await getClient();

  for (const [label, filepath] of [
    ['20260420100000_affiliate_program_reconciliation.sql', MIGRATION_RECON],
    ['20260420110000_affiliate_kiosk_marketplace.sql',      MIGRATION_KIOSK],
  ]) {
    log(`Applying ${label}`);
    const sql = fs.readFileSync(filepath, 'utf8');
    try {
      await c.query(sql);
      ok(`${label} applied`);
    } catch (e) {
      // Each migration is BEGIN/COMMIT wrapped internally; on error Postgres
      // rolls back the whole file.
      fail(`${label} failed: ${e.message}\n` +
           `       (Database unchanged — migration is atomic.)`);
    }
  }
}

async function cmd_verify() {
  log('Verifying schema state');

  const expected = [
    'affiliates','affiliate_clicks','affiliate_conversions','affiliate_payouts',
    'affiliate_payout_requests','affiliate_creatives','affiliate_creative_downloads',
    'affiliate_kiosks','affiliate_listings','affiliate_orders','affiliate_kiosk_views',
  ];
  const rows = await q(
    `SELECT table_name FROM information_schema.tables WHERE table_name = ANY($1::text[])`,
    [expected]
  );
  const present = new Set(rows.map(r => r.table_name));
  const missing = expected.filter(t => !present.has(t));
  if (missing.length) fail(`Missing tables: ${missing.join(', ')}`);
  ok(`All ${expected.length} affiliate tables present`);

  const cols = await q(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name='affiliates'
        AND column_name IN ('bridge_user_id','payout_rail','payout_destination','parent_affiliate_id','referral_code')`
  );
  const colSet = new Set(cols.map(r => r.column_name));
  for (const need of ['bridge_user_id','payout_rail','parent_affiliate_id']) {
    if (!colSet.has(need)) fail(`affiliates.${need} missing`);
  }
  ok(`affiliates extension columns present: ${[...colSet].join(',')}`);

  const dc = await qScalar(`SELECT COUNT(*) FROM companies WHERE id=$1`, [DEFAULT_COMPANY]);
  if (+dc !== 1) fail(`DEFAULT_COMPANY row (${DEFAULT_COMPANY}) missing in companies table`);
  ok('DEFAULT_COMPANY anchor row present');

  const fn = await qScalar(`SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='set_affiliate_updated_at')`);
  if (!fn) fail('set_affiliate_updated_at() trigger function missing');
  ok('Trigger function installed');

  const fkClicks = await qScalar(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='affiliate_clicks' AND column_name='affiliate_uuid')`
  );
  const fkConv = await qScalar(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='affiliate_conversions' AND column_name='affiliate_uuid')`
  );
  if (!fkClicks || !fkConv) fail('FK-fix columns missing (affiliate_clicks/conversions.affiliate_uuid)');
  ok('FK reconciliation columns present');

  ok('Schema verification passed');
}

async function cmd_seed(flags) {
  const mode = flags.find(f => ['--safe','--full','--dry'].includes(f));
  if (!mode) {
    fail(`seed requires an explicit mode flag: --safe, --full, or --dry
       --safe  omits CLAUDE, ANTHROPIC, GOOGLE, NINJA PROSTITUTES (public leaderboard safety)
       --full  includes all 40 rows (operator accepts public exposure risk)
       --dry   prints what would be written; does not touch the DB`);
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    fail('SUPABASE_URL and SUPABASE_SERVICE_KEY are required for the seed step');
  }

  const hasRecon = await qScalar(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='affiliates' AND column_name='bridge_user_id')`
  );
  if (!hasRecon) fail('Schema not migrated yet — run migrate first');

  if (mode === '--full') {
    warn('Running seed in FULL mode — CLAUDE/ANTHROPIC/GOOGLE/NINJA will land in the public leaderboard.');
    warn('Press Ctrl-C within 5 seconds to abort.');
    await new Promise(r => setTimeout(r, 5000));
  }

  log(`Running seed (${mode})`);
  const args = mode === '--safe' ? ['--safe']
             : mode === '--dry'  ? ['--dry']
             :                      [];
  const res = spawnSync(process.execPath, [SEED_SCRIPT, ...args], {
    stdio: 'inherit',
    env: process.env,
  });
  if (res.status !== 0) fail(`Seed exited with status ${res.status}`);
  ok('Seed step complete');
}

async function cmd_status() {
  log('Affiliate system status');

  const safe = async (sql) => {
    try { return await qScalar(sql); } catch (_) { return 'n/a'; }
  };

  const affiliates       = await safe(`SELECT COUNT(*) FROM affiliates WHERE company_id='${DEFAULT_COMPANY}'`);
  const kiosks           = await safe(`SELECT COUNT(*) FROM affiliate_kiosks WHERE company_id='${DEFAULT_COMPANY}'`);
  const publishedKiosks  = await safe(`SELECT COUNT(*) FROM affiliate_kiosks WHERE company_id='${DEFAULT_COMPANY}' AND is_published=true`);
  const listings         = await safe(`SELECT COUNT(*) FROM affiliate_listings WHERE company_id='${DEFAULT_COMPANY}' AND status='active'`);
  const orders           = await safe(`SELECT COUNT(*) FROM affiliate_orders WHERE company_id='${DEFAULT_COMPANY}'`);

  console.log(`  affiliates       ${affiliates}`);
  console.log(`  kiosks           ${kiosks} (published: ${publishedKiosks})`);
  console.log(`  active listings  ${listings}`);
  console.log(`  orders           ${orders}`);

  const hasRecon = await safe(`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='affiliates' AND column_name='bridge_user_id')::text`);
  const hasKiosk = await safe(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='affiliate_kiosks')::text`);
  console.log(`  schema: reconciliation=${hasRecon} kiosk_marketplace=${hasKiosk}`);
}

async function cmd_all(flags) {
  await cmd_check();        console.log();
  await cmd_backup();       console.log();
  await cmd_migrate(flags); console.log();
  await cmd_verify();       console.log();
  await cmd_status();       console.log();
  ok('Deploy prep complete. Next steps (manual):');
  console.log(`  1. ${C.c}node scripts/deploy-affiliate-system.js seed --safe${C.x}`);
  console.log(`  2. restart brain.js (pm2 / systemd — your environment)`);
  console.log(`  3. smoke test:`);
  console.log(`     curl -s "$BASE_URL/api/affiliate/dashboard?id=ryan"   # expect 401`);
  console.log(`     curl -s "$BASE_URL/api/shop/listings" | jq .count    # expect 0 until listings added`);
}

// ── Entrypoint ─────────────────────────────────────────────────────────────

const HELP = `deploy-affiliate-system.js — applies affiliate migrations safely.

Subcommands:
  check    verify env + DB connection (no writes)
  backup   snapshot affiliates table
  migrate  apply both migrations (idempotent; --force to override)
  verify   confirm schema landed
  seed     run seed script (one of: --safe, --full, --dry)
  status   read-only summary
  all      check → backup → migrate → verify (never seeds)

Flags:
  --safe   (seed) omit sensitive rows (Claude/Anthropic/Google/Ninja)
  --full   (seed) include all 40 rows
  --dry    (seed) preview without writing
  --force  (migrate) re-run even if already applied

Required env (in .env or shell):
  DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY
Recommended:
  JWT_SECRET, ADMIN_TOKEN
`;

(async () => {
  const [cmd, ...flags] = process.argv.slice(2);
  try {
    switch (cmd) {
      case 'check':   await cmd_check(); break;
      case 'backup':  await cmd_backup(); break;
      case 'migrate': await cmd_migrate(flags); break;
      case 'verify':  await cmd_verify(); break;
      case 'seed':    await cmd_seed(flags); break;
      case 'status':  await cmd_status(); break;
      case 'all':     await cmd_all(flags); break;
      case undefined:
      case 'help':
      case '-h':
      case '--help':
        console.log(HELP);
        break;
      default:
        fail(`Unknown subcommand: ${cmd}. Run with no args for help.`);
    }
  } catch (e) {
    fail(e.message || String(e));
  } finally {
    await closeClient();
  }
})();
