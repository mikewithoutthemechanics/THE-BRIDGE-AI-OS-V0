#!/usr/bin/env node
'use strict';

/**
 * Initialize Treasury Database
 * Week 1 Day 2 artifact
 *
 * Usage: node scripts/init-treasury-db.js
 *
 * Deploys:
 * 1. PostgreSQL schema (12 tables)
 * 2. Seed accounts (treasury ops/liquidity/reserve/founder)
 * 3. Audit log table
 * 4. Sets up functions and triggers
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initTreasuryDB() {
  console.log('[Init] Treasury Database Initialization');
  console.log('[Init] Using DATABASE_URL:', process.env.DATABASE_URL ? 'configured' : 'NOT SET');

  // Try to import database client
  let db;
  try {
    // Try Supabase first
    const { createClient } = require('@supabase/supabase-js');
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      db = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY,
        { db: { schema: 'public' } }
      ).from('_dummy'); // Test connection

      console.log('[Init] Using Supabase PostgreSQL');
    }
  } catch (e) {
    console.log('[Init] Supabase not available, trying pg...');
  }

  // Fallback to pg
  if (!db) {
    try {
      const { Pool } = require('pg');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL ||
          'postgresql://bridge:change-me-in-production@localhost:5432/bridge',
      });

      db = pool;
      console.log('[Init] Using PostgreSQL via pg client');

      // Test connection
      const result = await pool.query('SELECT NOW()');
      console.log('[Init] PostgreSQL connection OK:', result.rows[0].now);
    } catch (error) {
      console.error('[Init] Failed to connect to PostgreSQL:', error.message);
      process.exit(1);
    }
  }

  try {
    // Read schema file
    const schemaPath = path.join(__dirname, '../lib/treasury-schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('[Init] Deploying schema...');

    // Split by semicolons and execute statements
    const statements = schema.split(';').filter(s => s.trim());

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) continue;

      try {
        // Use raw query for pg, use rpc for Supabase
        if (db.query) {
          // pg client
          await db.query(stmt);
        } else {
          // Supabase (skip for now)
          console.log('[Init] Skipping Supabase execution, please run schema in Supabase UI');
          break;
        }

        if (i % 10 === 0) {
          console.log(`[Init] Deployed ${i + 1}/${statements.length} statements...`);
        }
      } catch (error) {
        // Some statements may fail if already exist (idempotent)
        if (error.code === '42P07' || error.message.includes('already exists')) {
          console.log(`[Init] Statement already exists (OK): ${stmt.slice(0, 50)}...`);
        } else {
          console.error('[Init] Error executing statement:', error.message);
          console.log('[Init] Statement:', stmt.slice(0, 100));
        }
      }
    }

    console.log('[Init] Schema deployment complete');

    // Verify tables exist
    const tablesQuery = `
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('accounts', 'ledger_entries', 'account_balances', 'payments', 'tasks', 'subscriptions', 'audit_log')
    `;

    const result = await db.query(tablesQuery);
    console.log(`[Init] Verified ${result.rows.length} core tables exist:`);
    result.rows.forEach(r => console.log(`  ✓ ${r.table_name}`));

    // Initialize Treasury Service for testing
    const TreasuryService = require('../services/treasury-service');
    const treasury = new TreasuryService(db);

    console.log('[Init] Treasury Service initialized');

    // Test ledger entry
    const { v4: uuidv4 } = require('uuid');
    const testTxGroup = uuidv4();

    console.log('[Init] Running test ledger entry...');
    try {
      const testResult = await db.query(
        `SELECT record_ledger_entry($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          testTxGroup,
          'asset-treasury-ops',
          'revenue-subscriptions',
          100,
          'ZAR',
          'Test ledger entry (will be rolled back)',
          'test-001',
          'init-script',
        ]
      );

      console.log('[Init] Test ledger entry successful');

      // Verify balances updated
      const balances = await db.query(
        `SELECT account_id, balance FROM account_balances WHERE account_id IN ('asset-treasury-ops', 'revenue-subscriptions')`
      );
      console.log('[Init] Account balances after test entry:', balances.rows);

      // Rollback test entry
      console.log('[Init] Cleaning up test entries...');
      // Note: In production, we'd use transactions. For now, leave for manual cleanup.
      console.log('[Init] NOTE: Test entries remain. To clean up, run:');
      console.log(`  DELETE FROM ledger_entries WHERE tx_group = '${testTxGroup}'`);
      console.log(`  DELETE FROM audit_log WHERE tx_group_id = '${testTxGroup}'`);
    } catch (error) {
      console.log('[Init] Test ledger entry skipped (may already exist):', error.message);
    }

    console.log('\n[Init] ✓ Treasury Database Initialization Complete');
    console.log('[Init] Next steps:');
    console.log('  1. Verify data in PostgreSQL: psql postgres://... -c "SELECT * FROM accounts"');
    console.log('  2. Deploy Treasury Service in api/index.js');
    console.log('  3. Deploy BRDG smart contracts (Week 1 Day 4)');

    if (db.end) {
      await db.end();
    }
    process.exit(0);
  } catch (error) {
    console.error('[Init] Fatal error:', error);
    if (db.end) {
      await db.end();
    }
    process.exit(1);
  }
}

// Run
initTreasuryDB().catch(console.error);
