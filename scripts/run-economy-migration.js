#!/usr/bin/env node
// Run a single SQL file against ECONOMY_DB_URL (PostgreSQL)
// Usage: node scripts/run-economy-migration.js migrations/005_affiliate_system.sql
'use strict';

require('dotenv').config({ override: false });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/run-economy-migration.js <file.sql>'); process.exit(1); }
if (!process.env.ECONOMY_DB_URL) { console.error('ECONOMY_DB_URL not set'); process.exit(1); }

const sql = fs.readFileSync(path.resolve(file), 'utf8');
const pool = new Pool({ connectionString: process.env.ECONOMY_DB_URL, ssl: { rejectUnauthorized: false } });

pool.query(sql)
  .then(() => { console.log('[migrate] OK:', file); process.exit(0); })
  .catch(e => { console.error('[migrate] FAILED:', e.message); process.exit(1); })
  .finally(() => pool.end());
