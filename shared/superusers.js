'use strict';

// Single-source superuser loader for Node backends (auth.js, middleware/auth.js,
// server.js). Reads shared/superusers.json at module load; falls back to the
// hardcoded list if the file is missing or malformed so a bad edit cannot
// lock every admin out of every process.
const fs = require('fs');
const path = require('path');

const FALLBACK = [
  'ryanpcowan@gmail.com',
  'michaelgraemek@gmail.com',
  'marvin.saunders@gmail.com',
];

function load() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'superusers.json'), 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed && parsed.superusers) ? parsed.superusers : [];
    const emails = list
      .map((row) => (row && typeof row.email === 'string') ? row.email.trim().toLowerCase() : null)
      .filter(Boolean);
    if (emails.length) return emails;
  } catch (err) {
    console.warn('[superusers] failed to read shared/superusers.json, falling back:', err.message);
  }
  return FALLBACK.slice();
}

const EMAILS = Object.freeze(load());

function isSuperUserEmail(email) {
  if (typeof email !== 'string') return false;
  return EMAILS.includes(email.trim().toLowerCase());
}

module.exports = { EMAILS, isSuperUserEmail };
