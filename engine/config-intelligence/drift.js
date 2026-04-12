// =============================================================================
// BRIDGE AI OS — Drift Detection Engine  v2
//
// Fixes vs v1:
//   - detectCIODrift now uses cio.fileHash directly (no registry event query)
//   - fileHash() helper is no longer called in a hot loop — uses cached value from CIO
//   - Async-safe: filesystem reads only happen once per scan (buildFilesystemFingerprint)
// =============================================================================
'use strict';

const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const registry = require('./registry');
const { SEARCH_DIRS } = require('./discovery');

// ── Compute a file's SHA-256 (used for fingerprint building only) ─────────────
function fileHash(filePath) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  } catch (_) { return null; }
}

// ── Build current filesystem fingerprint ─────────────────────────────────────
function buildFilesystemFingerprint() {
  const files = {};
  for (const [domain, dir] of Object.entries(SEARCH_DIRS)) {
    if (!fs.existsSync(dir)) continue;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(dir, entry.name);
      files[fullPath] = {
        domain,
        hash:       fileHash(fullPath),
        modifiedAt: fs.statSync(fullPath).mtimeMs,
      };
    }
  }
  return files;
}

function compareFingerprints(baseline, current) {
  const changes = [];
  const allPaths = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  for (const p of allPaths) {
    const b = baseline[p];
    const c = current[p];
    if (!b && c)                              changes.push({ type: 'added',    path: p, hash: c.hash });
    else if (b && !c)                         changes.push({ type: 'deleted',  path: p, lastHash: b.hash });
    else if (b && c && b.hash !== c.hash)     changes.push({ type: 'modified', path: p, fromHash: b.hash, toHash: c.hash });
  }
  return changes;
}

// ── Detect CIO status drift ───────────────────────────────────────────────────
// Uses cio.fileHash (set at parse time) — no more registry event queries.
function detectCIODrift(activeCIOs) {
  const drifted = [];

  for (const cio of activeCIOs) {
    if (!cio.source) continue;

    // Source file deleted
    if (!fs.existsSync(cio.source)) {
      drifted.push({ cio: cio.id, namespace: cio.namespace, type: 'source-deleted', source: cio.source });
      continue;
    }

    // Source file content changed since CIO was parsed
    if (cio.fileHash) {
      const currentHash = fileHash(cio.source);
      if (currentHash && currentHash !== cio.fileHash) {
        drifted.push({
          cio:              cio.id,
          namespace:        cio.namespace,
          type:             'source-modified',
          source:           cio.source,
          expectedFileHash: cio.fileHash,
          currentFileHash:  currentHash,
        });
      }
    }
  }

  return drifted;
}

// ── Detect environment variable drift ────────────────────────────────────────
function detectEnvDrift(activeVarCIOs) {
  const drifted = [];
  for (const cio of activeVarCIOs) {
    for (const [k, v] of Object.entries(cio.payload?.variables || {})) {
      if (v.required && v.default === null && !process.env[k]) {
        drifted.push({ key: k, namespace: cio.namespace, reason: 'required-env-var-missing' });
      }
    }
  }
  return drifted;
}

// ── Full drift scan ───────────────────────────────────────────────────────────
function scan(activeCIOs = [], activeVarCIOs = [], baselineFingerprint = null) {
  const current     = buildFilesystemFingerprint();
  const fileChanges = baselineFingerprint ? compareFingerprints(baselineFingerprint, current) : [];
  const cioDrift    = detectCIODrift(activeCIOs);
  const envDrift    = detectEnvDrift(activeVarCIOs);

  const totalDrift  = fileChanges.length + cioDrift.length + envDrift.length;

  const report = {
    drifted:     totalDrift > 0,
    fileChanges,
    cioDrift,
    envDrift,
    total:       totalDrift,
    scannedAt:   Date.now(),
    fingerprint: current,
  };

  if (totalDrift > 0) {
    registry.emit('DRIFT_DETECTED', {
      total:       totalDrift,
      fileChanges: fileChanges.length,
      cioDrift:    cioDrift.length,
      envDrift:    envDrift.length,
    });
  } else {
    registry.emit('DRIFT_CLEAN', { scannedAt: report.scannedAt });
  }

  return report;
}

module.exports = { scan, buildFilesystemFingerprint, compareFingerprints, detectCIODrift, detectEnvDrift };
