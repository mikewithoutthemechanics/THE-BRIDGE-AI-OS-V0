// =============================================================================
// BRIDGE AI OS — Discovery Engine
//
// Scans /config, /vars, /secrets for valid .bridge* files.
// Unknown extensions are quarantined, not silently ignored.
// Returns raw file records ready for the parser.
// =============================================================================
'use strict';

const fs   = require('fs');
const path = require('path');
const registry = require('./registry');

const ROOT = path.join(__dirname, '..', '..');

const SEARCH_DIRS = {
  config:  path.join(ROOT, 'config'),
  vars:    path.join(ROOT, 'vars'),
  secrets: path.join(ROOT, 'secrets'),
};

const VALID_EXTENSIONS = {
  '.bridgecfg': 'config',
  '.bridgevar': 'var',
  '.bridgesec': 'secret',
};

const QUARANTINE_DIR = path.join(__dirname, 'data', 'quarantine');

// ── Ensure directories exist ──────────────────────────────────────────────────
for (const dir of Object.values(SEARCH_DIRS)) fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(QUARANTINE_DIR, { recursive: true });

// ── Scan a single directory ───────────────────────────────────────────────────
function scanDir(dirPath, expectedType) {
  const valid   = [];
  const invalid = [];

  if (!fs.existsSync(dirPath)) return { valid, invalid };

  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (err) {
    registry.emit('DISCOVERY_ERROR', { dir: dirPath, error: err.message });
    return { valid, invalid };
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const fullPath = path.join(dirPath, entry.name);
    const ext      = path.extname(entry.name).toLowerCase();
    const declaredType = VALID_EXTENSIONS[ext];

    if (!declaredType) {
      // Non-bridge file in a bridge directory — quarantine
      invalid.push({ path: fullPath, name: entry.name, reason: `unknown-extension:${ext}` });
      continue;
    }

    if (declaredType !== expectedType) {
      // Wrong extension in wrong directory (e.g. .bridgesec in /config)
      invalid.push({ path: fullPath, name: entry.name, reason: `type-mismatch:expected-${expectedType}-got-${declaredType}` });
      continue;
    }

    let stat;
    try { stat = fs.statSync(fullPath); } catch (_) { continue; }

    let rawContent;
    try {
      rawContent = fs.readFileSync(fullPath, 'utf8');
    } catch (err) {
      invalid.push({ path: fullPath, name: entry.name, reason: `read-error:${err.message}` });
      continue;
    }

    valid.push({
      path:        fullPath,
      name:        entry.name,
      extension:   ext,
      type:        declaredType,
      rawContent,
      sizeBytes:   stat.size,
      modifiedAt:  stat.mtimeMs,
      discoveredAt: Date.now(),
    });
  }

  return { valid, invalid };
}

// ── Quarantine a bad file ─────────────────────────────────────────────────────
function quarantine(fileRecord) {
  const dest = path.join(QUARANTINE_DIR, `${Date.now()}_${path.basename(fileRecord.path)}`);
  try {
    fs.copyFileSync(fileRecord.path, dest);
    registry.emit('FILE_QUARANTINED', { source: fileRecord.path, dest, reason: fileRecord.reason });
  } catch (err) {
    registry.emit('QUARANTINE_FAILED', { source: fileRecord.path, error: err.message });
  }
}

// ── Full discovery scan ───────────────────────────────────────────────────────
function discover() {
  const results = { configs: [], vars: [], secrets: [], quarantined: [] };

  const configScan  = scanDir(SEARCH_DIRS.config,  'config');
  const varScan     = scanDir(SEARCH_DIRS.vars,     'var');
  const secretScan  = scanDir(SEARCH_DIRS.secrets,  'secret');

  results.configs  = configScan.valid;
  results.vars     = varScan.valid;
  results.secrets  = secretScan.valid;

  const allInvalid = [
    ...configScan.invalid,
    ...varScan.invalid,
    ...secretScan.invalid,
  ];

  for (const bad of allInvalid) {
    quarantine(bad);
    results.quarantined.push(bad);
  }

  registry.emit('DISCOVERY_COMPLETE', {
    configs:     results.configs.length,
    vars:        results.vars.length,
    secrets:     results.secrets.length,
    quarantined: results.quarantined.length,
  });

  return results;
}

module.exports = { discover, scanDir, VALID_EXTENSIONS, SEARCH_DIRS };
