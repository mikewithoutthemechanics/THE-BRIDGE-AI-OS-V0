/**
 * Apply hardened production schema to Supabase via direct pg connection.
 *
 * Usage: node scripts/apply-hardened-schema.js
 *
 * Connects using SUPABASE_URL + SUPABASE_SERVICE_KEY to derive the
 * direct Postgres connection string.
 */
'use strict';

require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Derive pg connection string from Supabase URL
// Format: https://PROJECT_REF.supabase.co → postgresql://postgres.PROJECT_REF:password@...
function getConnectionString() {
  const url = process.env.SUPABASE_URL;
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!match) throw new Error('Cannot parse SUPABASE_URL');
  const projectRef = match[1];

  // Supabase direct connection (pooler mode for transactions)
  return `postgresql://postgres.${projectRef}:${process.env.SUPABASE_DB_PASSWORD || 'YOUR_DB_PASSWORD'}@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('Applying hardened production schema to Supabase');
  console.log('═══════════════════════════════════════════════════════\n');

  const schemaSQL = fs.readFileSync(path.join(__dirname, '..', 'lib', 'treasury-schema.sql'), 'utf8');

  // Split SQL into executable statements, respecting $$ function bodies
  const statements = splitSQL(schemaSQL);
  console.log(`Parsed ${statements.length} statements from treasury-schema.sql\n`);

  // Try direct pg connection first, fall back to Supabase Management API
  let client;
  try {
    const connStr = getConnectionString();
    console.log('Connecting via direct pg...');
    client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
    await client.connect();
    console.log('Connected!\n');
  } catch (e) {
    console.log('Direct pg connection failed:', e.message);
    console.log('\nFalling back to Supabase SQL API...\n');

    // Use Supabase's built-in SQL execution via the Management API
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // Execute each statement via RPC
    let success = 0, failed = 0;
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt.length < 5) continue;

      try {
        // Try using the supabase-js .rpc approach or raw fetch
        const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/`, {
          method: 'POST',
          headers: {
            'apikey': process.env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: stmt }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        success++;
        process.stdout.write('.');
      } catch (e) {
        failed++;
        process.stdout.write('x');
      }
    }
    console.log(`\n\nResults: ${success} succeeded, ${failed} failed`);
    console.log('\nIMPORTANT: If statements failed, apply the schema manually:');
    console.log('1. Go to: https://supabase.com/dashboard/project/sdkysuvmtqjqopmdpvoz/sql');
    console.log('2. Paste the contents of: lib/treasury-schema.sql');
    console.log('3. Click "Run"');
    return;
  }

  // Execute each statement
  let success = 0, failed = 0, errors = [];
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (stmt.length < 5) continue;

    try {
      await client.query(stmt);
      success++;
      process.stdout.write('.');
    } catch (e) {
      failed++;
      errors.push({ index: i, error: e.message, stmt: stmt.slice(0, 80) });
      process.stdout.write('x');
    }
  }

  console.log(`\n\nResults: ${success} succeeded, ${failed} failed`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const err of errors) {
      console.log(`  [${err.index}] ${err.error}`);
      console.log(`       ${err.stmt}...`);
    }
  }

  // Verify key tables exist
  console.log('\nVerifying tables...');
  const tables = ['accounts', 'ledger_entries', 'account_balances', 'audit_log', 'payments', 'tasks', 'fiat_payouts', 'reconciliation_log'];
  for (const table of tables) {
    try {
      const { rows } = await client.query(`SELECT COUNT(*) AS n FROM ${table}`);
      console.log(`  ✓ ${table}: ${rows[0].n} rows`);
    } catch (e) {
      console.log(`  ✗ ${table}: ${e.message}`);
    }
  }

  await client.end();
  console.log('\nDone.');
}

/**
 * Split SQL into statements, respecting $$ function bodies.
 */
function splitSQL(sql) {
  const statements = [];
  let current = '';
  let inDollarQuote = false;

  for (const line of sql.split('\n')) {
    const trimmed = line.trim();

    // Skip pure comments
    if (trimmed.startsWith('--') && !inDollarQuote) {
      continue;
    }

    // Track $$ delimiters
    const dollarCount = (line.match(/\$\$/g) || []).length;
    if (dollarCount % 2 !== 0) {
      inDollarQuote = !inDollarQuote;
    }

    current += line + '\n';

    // Statement ends at ; when not inside $$ block
    if (trimmed.endsWith(';') && !inDollarQuote) {
      const stmt = current.trim();
      if (stmt.length > 2) statements.push(stmt);
      current = '';
    }
  }

  if (current.trim().length > 2) statements.push(current.trim());
  return statements;
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
