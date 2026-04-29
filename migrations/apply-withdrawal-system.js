#!/usr/bin/env node
/**
 * Apply Withdrawal System Migration (013_withdrawal_system.sql)
 * 
 * Run: node migrations/apply-withdrawal-system.js
 * 
 * This creates all 4 tables required for the withdrawal system:
 *   1. withdrawal_requests - User BRDG withdrawals
 *   2. agent_claims - Agent earnings claims
 *   3. fiat_payouts - Fiat off-ramp queue
 *   4. withdrawal_claims - Merkle-gated claims
 *   5. admin_withdrawals - Treasury audit log
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ADMIN_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[ERROR] SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function applyMigration() {
  console.log('[MIGRATION] Applying withdrawal system tables...\n');

  const sqlPath = path.join(__dirname, '013_withdrawal_system.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Split into individual statements (rough parsing for comments)
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'))
    .map(s => s + ';');

  const results = {
    success: [],
    skipped: [],
    errors: []
  };

  // Try to execute via RPC (for custom SQL)
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql: sql });
    if (error) throw error;
    console.log('[SUCCESS] Migration applied via exec_sql RPC\n');
    results.success.push('All tables created via RPC');
  } catch (rpcError) {
    // Fallback: try individual statements
    console.log('[INFO] RPC not available, falling back to individual statements...\n');
    
    // Key CREATE TABLE statements to try individually
    const coreTables = [
      {
        name: 'withdrawal_requests',
        sql: `CREATE TABLE IF NOT EXISTS withdrawal_requests (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id TEXT NOT NULL,
          amount NUMERIC NOT NULL CHECK (amount > 0),
          tx_hash TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          rail TEXT DEFAULT 'brdg',
          metadata JSONB,
          error_message TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          completed_at TIMESTAMPTZ
        )`
      },
      {
        name: 'agent_claims',
        sql: `CREATE TABLE IF NOT EXISTS agent_claims (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          amount NUMERIC NOT NULL CHECK (amount > 0),
          wallet_address TEXT,
          status TEXT NOT NULL DEFAULT 'pending_wallet',
          tx_hash TEXT,
          error TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          processed_at TIMESTAMPTZ
        )`
      },
      {
        name: 'fiat_payouts',
        sql: `CREATE TABLE IF NOT EXISTS fiat_payouts (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          payout_id TEXT NOT NULL UNIQUE,
          rail TEXT NOT NULL,
          brdg_amount NUMERIC NOT NULL CHECK (brdg_amount > 0),
          zar_amount NUMERIC NOT NULL CHECK (zar_amount > 0),
          exchange_rate NUMERIC NOT NULL,
          destination TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'queued',
          processed_at TIMESTAMPTZ,
          bank_reference TEXT,
          queued_at TIMESTAMPTZ DEFAULT NOW(),
          metadata JSONB
        )`
      },
      {
        name: 'withdrawal_claims',
        sql: `CREATE TABLE IF NOT EXISTS withdrawal_claims (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          merkle_root TEXT NOT NULL,
          leaf_index INTEGER NOT NULL,
          claimant TEXT NOT NULL,
          amount NUMERIC NOT NULL CHECK (amount > 0),
          rail TEXT NOT NULL,
          tx_hash TEXT,
          claimed_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(merkle_root, leaf_index)
        )`
      },
      {
        name: 'admin_withdrawals',
        sql: `CREATE TABLE IF NOT EXISTS admin_withdrawals (
          id TEXT PRIMARY KEY,
          "to" TEXT NOT NULL,
          amount NUMERIC NOT NULL,
          fee NUMERIC NOT NULL DEFAULT 0,
          net NUMERIC NOT NULL,
          rail TEXT NOT NULL,
          memo TEXT,
          tx_hash TEXT,
          zar_amount NUMERIC,
          exchange_rate NUMERIC,
          merkle_root TEXT,
          pipeline TEXT,
          ts BIGINT NOT NULL
        )`
      }
    ];

    for (const table of coreTables) {
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: table.sql });
        if (error) {
          // Try direct REST API as fallback
          console.log(`[WARN] RPC failed for ${table.name}, trying REST...`);
          results.skipped.push(table.name);
        } else {
          console.log(`[SUCCESS] Created table: ${table.name}`);
          results.success.push(table.name);
        }
      } catch (e) {
        console.log(`[SKIP] ${table.name}: ${e.message}`);
        results.skipped.push(table.name);
      }
    }
  }

  // Verify tables exist by probing
  console.log('\n[VERIFICATION] Checking table existence...\n');
  
  const tablesToCheck = [
    'withdrawal_requests',
    'agent_claims', 
    'fiat_payouts',
    'withdrawal_claims',
    'admin_withdrawals'
  ];

  for (const tableName of tablesToCheck) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });
      
      if (error && error.code === '42P01') {
        console.log(`[MISSING] ${tableName}: Table does not exist`);
        results.errors.push(tableName);
      } else if (error) {
        console.log(`[ERROR] ${tableName}: ${error.message}`);
        results.errors.push(tableName);
      } else {
        console.log(`[OK] ${tableName}: Exists and accessible`);
      }
    } catch (e) {
      console.log(`[ERROR] ${tableName}: ${e.message}`);
      results.errors.push(tableName);
    }
  }

  // Check/add wallet_address column to users
  console.log('\n[VERIFICATION] Checking users.wallet_address column...\n');
  try {
    const { data, error } = await supabase
      .from('users')
      .select('wallet_address')
      .limit(1);
    
    if (error && error.message.includes('wallet_address')) {
      console.log('[MISSING] users.wallet_address column does not exist');
      console.log('[ACTION] Run this SQL in Supabase dashboard:');
      console.log('  ALTER TABLE users ADD COLUMN wallet_address TEXT;');
      console.log('  CREATE INDEX idx_users_wallet_address ON users(wallet_address) WHERE wallet_address IS NOT NULL;');
    } else {
      console.log('[OK] users.wallet_address column exists');
    }
  } catch (e) {
    console.log(`[WARN] Could not verify users.wallet_address: ${e.message}`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Successful: ${results.success.length}`);
  console.log(`Skipped:    ${results.skipped.length}`);
  console.log(`Errors:     ${results.errors.length}`);
  
  if (results.success.length > 0) {
    console.log('\n[✓] Created:');
    results.success.forEach(s => console.log(`    - ${s}`));
  }
  
  if (results.skipped.length > 0) {
    console.log('\n[!] Skipped (may need manual SQL):');
    results.skipped.forEach(s => console.log(`    - ${s}`));
    console.log('\n[MANUAL SQL REQUIRED] Run the following in Supabase SQL Editor:');
    console.log('  https://supabase.com/dashboard/project/_/editor');
    console.log('\nSQL file location:');
    console.log(`  ${sqlPath}`);
  }
  
  if (results.errors.length > 0) {
    console.log('\n[✗] Errors:');
    results.errors.forEach(e => console.log(`    - ${e}`));
    process.exit(1);
  }

  console.log('\n[COMPLETE] Withdrawal system migration finished.\n');
}

applyMigration().catch(err => {
  console.error('[FATAL ERROR]', err.message);
  process.exit(1);
});
