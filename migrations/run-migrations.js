'use strict';

/**
 * run-migrations.js
 * Runs all .sql migration files in /migrations against users.db
 * Usage: node migrations/run-migrations.js
 */

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DB_PATH        = path.join(__dirname, '..', 'users.db');
const MIGRATIONS_DIR = __dirname;

console.log(`[migrate] Opening database: ${DB_PATH}`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Ensure migration tracking table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT UNIQUE NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const applied = db.prepare('SELECT filename FROM _migrations').all().map(r => r.filename);
const insert  = db.prepare('INSERT INTO _migrations (filename) VALUES (?)');

const files = fs.readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.log('[migrate] No SQL migration files found.');
  process.exit(0);
}

let count = 0;
for (const file of files) {
  if (applied.includes(file)) {
    console.log(`[migrate] skip (already applied): ${file}`);
    continue;
  }

  const filePath = path.join(MIGRATIONS_DIR, file);
  const sql      = fs.readFileSync(filePath, 'utf8').trim();

  try {
    db.exec(sql);
    insert.run(file);
    console.log(`[migrate] applied: ${file}`);
    count++;
  } catch (err) {
    console.error(`[migrate] FAILED on ${file}: ${err.message}`);
    process.exit(1);
  }
}

db.close();
console.log(`[migrate] Done. ${count} migration(s) applied.`);
