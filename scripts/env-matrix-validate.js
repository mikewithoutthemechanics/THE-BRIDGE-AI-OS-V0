#!/usr/bin/env node
// env-matrix-validate.js — validates a .env file against config/env-matrix.json
//
// Modes:
//   node scripts/env-matrix-validate.js                 # validates process.env
//   node scripts/env-matrix-validate.js path/to/.env    # validates a file
//   node scripts/env-matrix-validate.js --json          # JSON output for CI
//
// Exit codes:
//   0 = all required vars present + no critical secrets look weak/missing
//   1 = missing required vars
//   2 = weak secrets (shorter than 16 chars or placeholder-looking)
//   3 = schema file invalid

const fs = require('fs');
const path = require('path');

const MATRIX_PATH = path.join(__dirname, '..', 'config', 'env-matrix.json');
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const envFilePath = args.find(a => !a.startsWith('--'));

function loadMatrix() {
  const raw = fs.readFileSync(MATRIX_PATH, 'utf8');
  return JSON.parse(raw);
}

function parseEnvFile(p) {
  if (!fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, 'utf8');
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function looksWeak(val) {
  if (!val || val.length < 16) return true;
  const placeholders = /^(change.?me|replace.?me|your[-_]?|placeholder|example|xxx+|secret|password|test)/i;
  return placeholders.test(val);
}

function flatten(matrix) {
  const out = [];
  for (const [catKey, cat] of Object.entries(matrix.categories)) {
    for (const v of cat.vars) {
      out.push({ ...v, _category: catKey, _categoryLabel: cat.label });
    }
  }
  return out;
}

function validate(env, matrix) {
  const all = flatten(matrix);
  const report = {
    summary: { total: all.length, required: 0, required_present: 0, required_missing: 0,
               secrets: 0, secrets_present: 0, weak_secrets: 0, unknown_in_env: 0 },
    missing_required: [],
    weak_secrets: [],
    unknown_in_env: [],
    by_category: {},
  };

  const knownKeys = new Set(all.map(v => v.name));

  for (const v of all) {
    if (v.required) report.summary.required++;
    if (v.secret) report.summary.secrets++;
    const present = env[v.name] !== undefined && env[v.name] !== '';
    if (v.required) {
      if (present) report.summary.required_present++;
      else {
        report.summary.required_missing++;
        report.missing_required.push({ name: v.name, category: v._category });
      }
    }
    if (v.secret && present) {
      report.summary.secrets_present++;
      if (looksWeak(env[v.name])) {
        report.summary.weak_secrets++;
        report.weak_secrets.push({ name: v.name, category: v._category });
      }
    }
    const bucket = report.by_category[v._category] ||= { label: v._categoryLabel, total: 0, present: 0, missing_required: 0 };
    bucket.total++;
    if (present) bucket.present++;
    if (v.required && !present) bucket.missing_required++;
  }

  for (const key of Object.keys(env)) {
    if (!knownKeys.has(key)) {
      report.summary.unknown_in_env++;
      report.unknown_in_env.push(key);
    }
  }

  return report;
}

function printHuman(report) {
  const s = report.summary;
  console.log('\nENV MATRIX VALIDATION\n');
  console.log(`  Total vars defined in matrix: ${s.total}`);
  console.log(`  Required: ${s.required_present}/${s.required} present (${s.required_missing} missing)`);
  console.log(`  Secrets:  ${s.secrets_present}/${s.secrets} present (${s.weak_secrets} look weak)`);
  console.log(`  Unknown keys in env (not in matrix): ${s.unknown_in_env}\n`);

  if (report.missing_required.length) {
    console.log('MISSING REQUIRED:');
    for (const m of report.missing_required) console.log(`  [${m.category}] ${m.name}`);
    console.log('');
  }
  if (report.weak_secrets.length) {
    console.log('WEAK-LOOKING SECRETS (short or placeholder-ish):');
    for (const m of report.weak_secrets) console.log(`  [${m.category}] ${m.name}`);
    console.log('');
  }
  if (report.unknown_in_env.length && report.unknown_in_env.length < 30) {
    console.log('UNKNOWN KEYS (consider adding to matrix):');
    for (const k of report.unknown_in_env) console.log(`  ${k}`);
    console.log('');
  } else if (report.unknown_in_env.length) {
    console.log(`UNKNOWN KEYS: ${report.unknown_in_env.length} total (run --json for full list)\n`);
  }

  console.log('BY CATEGORY:');
  for (const [k, c] of Object.entries(report.by_category)) {
    const bar = c.missing_required === 0 ? 'OK ' : 'GAP';
    console.log(`  [${bar}] ${c.label.padEnd(50)} ${c.present}/${c.total}${c.missing_required ? ` (MISSING ${c.missing_required} required)` : ''}`);
  }
}

function main() {
  let matrix;
  try { matrix = loadMatrix(); } catch (e) {
    console.error('ERROR: failed to load env-matrix.json:', e.message);
    process.exit(3);
  }

  const env = envFilePath ? parseEnvFile(envFilePath) : process.env;
  if (envFilePath && !env) {
    console.error(`ERROR: env file not found: ${envFilePath}`);
    process.exit(3);
  }

  const report = validate(env, matrix);

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  if (report.summary.required_missing > 0) process.exit(1);
  if (report.summary.weak_secrets > 0) process.exit(2);
  process.exit(0);
}

main();
