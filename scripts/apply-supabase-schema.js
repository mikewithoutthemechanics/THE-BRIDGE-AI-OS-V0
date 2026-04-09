#!/usr/bin/env node
/**
 * Apply PostgreSQL schema to Supabase
 *
 * Usage:
 *   # Option 1: Provide DATABASE_URL (from Supabase Dashboard > Settings > Database)
 *   DATABASE_URL="postgresql://postgres.sdkysuvmtqjqopmdpvoz:YOUR_DB_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres" node scripts/apply-supabase-schema.js
 *
 *   # Option 2: Provide SUPABASE_ACCESS_TOKEN (personal access token from supabase.com/dashboard/account/tokens)
 *   SUPABASE_ACCESS_TOKEN="sbp_..." node scripts/apply-supabase-schema.js
 *
 *   # Option 3: Use the Supabase CLI (must be logged in via `npx supabase login`)
 *   npx supabase db query -f scripts/supabase-schema.sql --linked
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA_FILE = path.join(__dirname, 'supabase-schema.sql');
const PROJECT_REF = 'sdkysuvmtqjqopmdpvoz';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNka3lzdXZtdHFqcW9wbWRwdm96Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY4NTgzNCwiZXhwIjoyMDkxMjYxODM0fQ.3dCkxsaCPMjN88h3EftSpAfTmU0ECOspXHqT3yAjGX0';

const schemaSQL = fs.readFileSync(SCHEMA_FILE, 'utf8');

// ─── Method 1: Direct PostgreSQL connection ─────────────────────────────
async function applyViaPg(databaseUrl) {
  const { Client } = require('pg');
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  console.log('Connecting to PostgreSQL...');
  await client.connect();
  console.log('Connected! Executing schema...');
  await client.query(schemaSQL);
  console.log('Schema applied successfully via pg.');
  await client.end();
  return true;
}

// ─── Method 2: Supabase Management API ──────────────────────────────────
async function applyViaManagementAPI(accessToken) {
  console.log('Executing schema via Supabase Management API...');
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: schemaSQL }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Management API returned ${res.status}: ${text.substring(0, 300)}`);
  }

  console.log('Schema applied successfully via Management API.');
  return true;
}

// ─── Verification ───────────────────────────────────────────────────────
async function verifyTables() {
  console.log('\n=== Verifying Tables ===\n');
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const tables = [
    'users', 'agent_balances', 'agent_transactions', 'agents',
    'agent_memory', 'api_keys', 'data_signals', 'agent_routing_weights',
    'merchant_bids', 'page_economics', 'tasks_market', 'referrals',
    'payments', 'crm_leads', 'crm_interactions', 'crm_campaigns',
    'email_outreach', 'email_sent', 'email_opens', 'email_clicks',
    'email_followups', 'osint_registry', 'empeleni_clients',
    'empeleni_payments', 'commerce_index', 'external_agents'
  ];

  let found = 0;
  let missing = 0;

  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(0);
      if (error) {
        console.log(`  MISSING: ${table}`);
        missing++;
      } else {
        console.log(`  OK: ${table}`);
        found++;
      }
    } catch (err) {
      console.log(`  ERROR: ${table} => ${err.message}`);
      missing++;
    }
  }

  console.log(`\n=== Result: ${found}/${tables.length} tables exist, ${missing} missing ===`);
  return { found, missing, total: tables.length };
}

// ─── Main ───────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Bridge AI OS - Supabase Schema Deployment ===');
  console.log(`Schema file: ${SCHEMA_FILE}\n`);

  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

  let applied = false;

  // Try Method 1: DATABASE_URL
  if (databaseUrl && databaseUrl.includes('supabase')) {
    try {
      applied = await applyViaPg(databaseUrl);
    } catch (err) {
      console.log(`pg connection failed: ${err.message}\n`);
    }
  }

  // Try Method 2: Management API with access token
  if (!applied && accessToken) {
    try {
      applied = await applyViaManagementAPI(accessToken);
    } catch (err) {
      console.log(`Management API failed: ${err.message}\n`);
    }
  }

  // If nothing worked, print instructions
  if (!applied) {
    console.log('=== Could not apply schema automatically ===\n');
    console.log('No DATABASE_URL or SUPABASE_ACCESS_TOKEN provided.\n');
    console.log('Choose one of these options:\n');
    console.log('Option A: Copy-paste the SQL into the Supabase SQL Editor:');
    console.log(`  https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new\n`);
    console.log('Option B: Set DATABASE_URL from Dashboard > Settings > Database > Connection String:');
    console.log('  DATABASE_URL="postgresql://postgres.sdkysuvmtqjqopmdpvoz:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres" node scripts/apply-supabase-schema.js\n');
    console.log('Option C: Use Supabase CLI (login first with `npx supabase login`):');
    console.log('  npx supabase link --project-ref sdkysuvmtqjqopmdpvoz');
    console.log('  npx supabase db query -f scripts/supabase-schema.sql --linked\n');
    console.log('Option D: Set SUPABASE_ACCESS_TOKEN (from https://supabase.com/dashboard/account/tokens):');
    console.log('  SUPABASE_ACCESS_TOKEN="sbp_..." node scripts/apply-supabase-schema.js\n');
  }

  // Always verify
  const result = await verifyTables();

  if (result.found === result.total) {
    console.log('\nAll tables created and verified!');
    process.exit(0);
  } else if (result.found > 0) {
    console.log(`\nPartially created: ${result.found}/${result.total}. Check errors above.`);
    process.exit(1);
  } else {
    console.log('\nNo tables found. Schema needs to be applied first.');
    process.exit(applied ? 1 : 2);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
