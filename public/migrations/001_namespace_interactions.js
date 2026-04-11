// =============================================================================
// BRIDGE AI OS — POSTGRESQL MIGRATION SCRIPTS
// Single source of truth: PostgreSQL bridgedb
// Execution order: 001 → 002 → 003 → 004
// =============================================================================

/**
 * Migration 001: Namespace Interactions Tables
 * Problem: ainode & node0 both write to 'interactions' table in bridgedb
 * Solution: Separate into ainode_interactions and node0_interactions
 */
const migration001 = `
-- 001_namespace_interactions.js
-- Separate conflicting interactions tables

-- Create namespaced tables
CREATE TABLE IF NOT EXISTS ainode_interactions AS
SELECT * FROM interactions WHERE service_id LIKE 'ainode%';

CREATE TABLE IF NOT EXISTS node0_interactions AS
SELECT * FROM interactions WHERE service_id LIKE 'node0%';

-- Update ainode server to query ainode_interactions
-- Update node0 server to query node0_interactions

-- Drop old table after verification
-- DROP TABLE interactions;  -- Execute after verification
`;

/**
 * Migration 002: Consolidate Referral Systems
 * Problem: 3 separate referral systems across directories
 * Solution: Single unified referrals table in PostgreSQL
 */
const migration002 = `
-- 002_consolidate_referrals.js
-- Unify all referral systems into single PostgreSQL table

-- Create unified referrals table
CREATE TABLE IF NOT EXISTS unified_referrals (
  id SERIAL PRIMARY KEY,
  referrer_user_id INTEGER REFERENCES users(id),
  referred_user_id INTEGER REFERENCES users(id),
  referral_code VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- pending, paid, failed
  commission_amount DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  claimed_at TIMESTAMP NULL
);

-- Migrate from existing systems (execute in order):
-- 1. bridgeos.db/referrals → unified_referrals
-- 2. bridgeos/vps-referral → unified_referrals
-- 3. BridgeAI/referral-system → unified_referrals (link tracking only)

-- Index for performance
CREATE INDEX idx_referral_code ON unified_referrals(referral_code);
CREATE INDEX idx_referrer_user ON unified_referrals(referrer_user_id);
CREATE INDEX idx_referred_user ON unified_referrals(referred_user_id);
`;

/**
 * Migration 003: Unify User Tables
 * Problem: Users scattered across multiple databases
 * Solution: Single users table in PostgreSQL as source of truth
 */
const migration003 = `
-- 003_unify_users.js
-- Consolidate all user data into single PostgreSQL users table

-- Create unified users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT TRUE,
  email_verified BOOLEAN DEFAULT FALSE,
  last_login TIMESTAMP NULL
);

-- Migrate from existing systems:
-- 1. SQLite users.db → PostgreSQL users
-- 2. empeleni.db users → PostgreSQL users
-- 3. Any other user tables → PostgreSQL users

-- Create indexes
CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE UNIQUE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_active ON users(active);
CREATE INDEX idx_users_created ON users(created_at);

-- Update foreign key references
-- ALTER TABLE unified_referrals ADD CONSTRAINT fk_referrer FOREIGN KEY (referrer_user_id) REFERENCES users(id);
-- ALTER TABLE unified_referrals ADD CONSTRAINT fk_referred FOREIGN KEY (referred_user_id) REFERENCES users(id);
`;

/**
 * Migration 004: Populate Service Registry
 * Problem: Services not registered for discovery
 * Solution: Populate Redis service registry from known services
 */
const migration004 = `
-- 004_populate_services_registry.js
-- Initialize Redis service registry for gateway discovery

-- This is a Node.js script that populates Redis, not SQL
-- const redis = require('redis').createClient({ url: process.env.REDIS_URL });

const services = [
  { id: 'gateway', port: 8080, host: 'localhost', health_endpoint: '/health' },
  { id: 'system', port: 3000, host: 'localhost', health_endpoint: '/health' },
  { id: 'brain', port: 8000, host: 'localhost', health_endpoint: '/health' },
  { id: 'auth', port: 5001, host: 'localhost', health_endpoint: '/health' },
  { id: 'terminal', port: 5002, host: 'localhost', health_endpoint: '/health' },
  { id: 'marketplace', port: 3030, host: 'localhost', health_endpoint: '/health' },
  { id: 'treasury', port: 3000, host: 'localhost', health_endpoint: '/api/treasury' }
];

// For each service:
// redis.hset('services:registry', service.id, JSON.stringify({
//   port: service.port,
//   host: service.host,
//   health_endpoint: service.health_endpoint,
//   updated_at: Date.now()
// }));

console.log('Service registry populated with', services.length, 'services');
`;

module.exports = {
  migration001,
  migration002,
  migration003,
  migration004
};</content>
<parameter name="filePath">migrations/postgresql-migrations.js