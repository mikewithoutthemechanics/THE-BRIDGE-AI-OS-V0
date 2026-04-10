'use strict';
/**
 * lib/migrate-zero-trust.js — Auto-migration for zero-trust tables
 *
 * Called once on first API request. Creates payment_proofs and merkle_anchors
 * tables if they don't exist, using individual column-based creation via
 * Supabase REST (since DDL isn't available through the JS client).
 *
 * Strategy: attempt a SELECT on each table. If it fails with "does not exist",
 * use the pg module to run DDL directly (if DATABASE_URL is available),
 * otherwise log the migration SQL for manual execution.
 */
const { supabaseAdmin: sb, isConfigured } = require('./supabase');

let migrated = false;

async function ensureTables() {
  if (migrated || !isConfigured) return;
  migrated = true; // prevent re-entry

  try {
    const { error: e1 } = await sb.from('payment_proofs').select('transaction_id').limit(0);
    if (!e1) {
      // Table exists
      const { error: e2 } = await sb.from('merkle_anchors').select('id').limit(0);
      if (!e2) return; // both exist
    }

    // Tables missing — try pg direct connection
    const pgUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
    if (pgUrl && pgUrl.includes('supabase')) {
      const { Client } = require('pg');
      const client = new Client({ connectionString: pgUrl, ssl: { rejectUnauthorized: false } });
      await client.connect();
      await client.query(require('./proof-store').MIGRATION_SQL);
      await client.end();
      console.log('[migrate] Zero-trust tables created via pg');
      return;
    }

    console.warn('[migrate] Cannot auto-create tables. Run this SQL in Supabase SQL Editor:');
    console.warn(require('./proof-store').MIGRATION_SQL);
  } catch (e) {
    console.warn('[migrate] Migration check failed:', e.message);
    // Non-fatal — proof-store falls back to in-memory
  }
}

module.exports = { ensureTables };
