// =============================================================================
// BRIDGE AI OS — Drift Detection Engine
//
// Compares the current filesystem state against the last known-good snapshot.
// Detects:
//   - New files added since last scan
//   - Files modified (hash changed)
//   - Files deleted
//   - CIO status drift (active CIO now fails validation)
//   - Environment variable drift (expected var now missing)
// =============================================================================
'use strict';

const fs       = require('fs');
const crypto   = require('crypto');
const registry = require('./registry');
const snapshot = require('./snapshot');
const { SEARCH_DIRS } = require('./discovery');

// ── Compute a file's current SHA-256 ─────────────────────────────────────────
function fileHash(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch (_) { return null; }
}

// ── Build current filesystem fingerprint ─────────────────────────────────────
function buildFilesystemFingerprint() {
  const files = {};
  for (const [domain, dir] of Object.entries(SEARCH_DIRS)) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const fullPath = `${dir}/${entry.name}`;
      files[fullPath] = {
        domain,
        hash:       fileHash(fullPath),
        modifiedAt: fs.statSync(fullPath).mtimeMs,
      };
    }
  }
  return files;
}

// ── Compare two fingerprints ──────────────────────────────────────────────────
function compareFingerprints(baseline, current) {
  const changes = [];

  const allPaths = new Set([...Object.keys(baseline), ...Object.keys(current)]);

  for (const p of allPaths) {
    const b = baseline[p];
    const c = current[p];

    if (!b && c) {
      changes.push({ type: 'added', path: p, hash: c.hash });
    } else if (b && !c) {
      changes.push({ type: 'deleted', path: p, lastHash: b.hash });
    } else if (b && c && b.hash !== c.hash) {
      changes.push({ type: 'modified', path: p, fromHash: b.hash, toHash: c.hash });
    }
  }

  return changes;
}

// ── Detect CIO status drift ───────────────────────────────────────────────────
// Active CIO's source file may have changed on disk — checks if still consistent
function detectCIODrift(activeCIOs) {
  const drifted = [];

  for (const cio of activeCIOs) {
    if (!cio.source || !fs.existsSync(cio.source)) {
      drifted.push({ cio: cio.id, namespace: cio.namespace, type: 'source-deleted', source: cio.source });
      continue;
    }

    const currentHash = fileHash(cio.source);
    // The CIO content hash is derived from its parsed content, not raw file bytes —
    // so compare raw file hash stored at parse time vs. current
    const parseEvent = registry.getEvents({ type: 'CIO_CREATED' })
      .filter(e => e.cioHash === cio.hash)
      .pop();

    if (parseEvent?.data?.fileHash && parseEvent.data.fileHash !== currentHash) {
      drifted.push({
        cio:       cio.id,
        namespace: cio.namespace,
        type:      'source-modified',
        source:    cio.source,
        expectedFileHash: parseEvent.data.fileHash,
        currentFileHash:  currentHash,
      });
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
  const current = buildFilesystemFingerprint();
  const fileChanges = baselineFingerprint ? compareFingerprints(baselineFingerprint, current) : [];
  const cioDrift    = detectCIODrift(activeCIOs);
  const envDrift    = detectEnvDrift(activeVarCIOs);

  const totalDrift = fileChanges.length + cioDrift.length + envDrift.length;

  const report = {
    drifted:      totalDrift > 0,
    fileChanges,
    cioDrift,
    envDrift,
    total:        totalDrift,
    scannedAt:    Date.now(),
    fingerprint:  current,
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
