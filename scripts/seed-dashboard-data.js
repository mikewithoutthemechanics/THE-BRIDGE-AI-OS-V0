#!/usr/bin/env node

/**
 * Seed initial data for Bridge AI OS Executive Dashboard
 * Run with: node scripts/seed-dashboard-data.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const economyDb = new Pool({
  connectionString: process.env.ECONOMY_DB_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
});

async function seedData() {
  console.log('🌱 Seeding Bridge AI OS dashboard data...');

  try {
    // Seed treasury data
    await economyDb.query(`
      INSERT INTO treasury_buckets (name, balance_brdg, last_updated)
      VALUES
        ('operations', 50000.0, NOW()),
        ('ubi_pool', 25000.0, NOW()),
        ('treasury', 100000.0, NOW()),
        ('founder', 25000.0, NOW())
      ON CONFLICT (name) DO UPDATE SET
        balance_brdg = EXCLUDED.balance_brdg,
        last_updated = NOW()
    `);

    // Seed some transaction history
    await economyDb.query(`
      INSERT INTO treasury_transactions (source_project, method, amount_brdg, description, created_at)
      VALUES
        ('crm', 'payfast', 5000.0, 'Client payment - ABC Corp', NOW() - INTERVAL '2 days'),
        ('marketplace', 'crypto', 2500.0, 'Task completion payment', NOW() - INTERVAL '1 day'),
        ('invoicing', 'stripe', 7500.0, 'Invoice payment - XYZ Ltd', NOW() - INTERVAL '6 hours'),
        ('crm', 'eft', 12000.0, 'Monthly retainer - Tech Solutions', NOW() - INTERVAL '3 hours')
      ON CONFLICT DO NOTHING
    `);

    // Seed mission board data
    await economyDb.query(`
      INSERT INTO mission_board (status, count, last_updated)
      VALUES
        ('backlog', 12, NOW()),
        ('in_progress', 5, NOW()),
        ('review', 3, NOW()),
        ('done', 28, NOW())
      ON CONFLICT (status) DO UPDATE SET
        count = EXCLUDED.count,
        last_updated = NOW()
    `);

    console.log('✅ Dashboard data seeded successfully');
    console.log('💰 Treasury: R157,500 BRDG across 4 buckets');
    console.log('📊 Transactions: 4 recent entries');
    console.log('🎯 Missions: 48 total tasks tracked');

  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
  } finally {
    await economyDb.end();
  }
}

if (require.main === module) {
  seedData();
}

module.exports = { seedData };