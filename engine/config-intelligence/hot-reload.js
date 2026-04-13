// =============================================================================
// BRIDGE AI OS — Hot-Reload Pipeline
//
// Processes a SINGLE changed file through the full validation→activation
// pipeline without touching any other active CIOs.
//
// On file CHANGE:
//   1. Read + fileHash → dedup check (skip if content unchanged)
//   2. Parse → CIO
//   3. Validate (4 layers)
//   4. Score
//   5. Namespace competition: does new CIO beat current active?
//   6. Sandbox simulation
//   7. Secrets encryption (if .bridgesec)
//   8. Atomic swap: activate new, supersede old
//   9. Rebuild merged state from all actives
//  10. Save snapshot
//
// On file DELETE:
//   - Supersede the active CIO for that source path
//   - Rebuild and snapshot merged state
//
// All stages emit registry events. No silent failures.
// =============================================================================
'use strict';

const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const registry  = require('./registry');
const { CIO, globalStore } = require('./cio');
const { VALID_EXTENSIONS } = require('./discovery');
const parser    = require('./parser');
const validator = require('./validator');
const scorer    = require('./scorer');
const resolver  = require('./resolver');
const sandbox   = require('./sandbox');
const secrets_  = require('./secrets');
const snapshot  = require('./snapshot');

// ── SSE broadcast — push events to connected admin clients ────────────────────
const _sseClients = new Set();

function pushSSE(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of _sseClients) {
    try { res.write(msg); } catch (_) { _sseClients.delete(res); }
  }
}

function registerSSEClient(res) { _sseClients.add(res); }
function unregisterSSEClient(res) { _sseClients.delete(res); }

// ── Rebuild merged state from current active CIOs ─────────────────────────────
function rebuildMerged() {
  const actives = globalStore.allActive();
  const selected = {
    configs:    actives.filter(c => c.type === 'config'),
    vars:       actives.filter(c => c.type === 'var'),
    secrets:    actives.filter(c => c.type === 'secret'),
    superseded: [],
  };
  return resolver.mergeToState(selected);
}

// ── Process a changed or new file ─────────────────────────────────────────────
async function processChange(filePath) {
  const startTs = Date.now();
  const ext     = path.extname(filePath).toLowerCase();
  const type    = VALID_EXTENSIONS[ext];

  if (!type) return { ok: false, reason: 'not-a-bridge-file' };

  registry.emit('HOT_RELOAD_START', { path: filePath, type });
  pushSSE('reload_start', { path: filePath, type });

  // 1. Read file
  let rawContent;
  try { rawContent = fs.readFileSync(filePath, 'utf8'); } catch (err) {
    registry.emit('HOT_RELOAD_FAILED', { path: filePath, stage: 'read', error: err.message });
    pushSSE('reload_failed', { path: filePath, stage: 'read', error: err.message });
    return { ok: false, stage: 'read', error: err.message };
  }

  // 2. Dedup — skip if content hasn't changed from the currently active CIO
  const fhash = crypto.createHash('sha256').update(rawContent, 'utf8').digest('hex');
  const existing = globalStore.getBySourceHash(filePath, fhash);
  if (existing && existing.status === 'active') {
    registry.emit('HOT_RELOAD_SKIPPED', { path: filePath, reason: 'content-unchanged', hash: fhash });
    pushSSE('reload_skipped', { path: filePath, reason: 'content-unchanged' });
    return { ok: true, action: 'skipped', reason: 'content-unchanged' };
  }

  // 3. Parse
  const parseResult = parser.parseFile({ path: filePath, name: path.basename(filePath), extension: ext, type, rawContent, fileHash: fhash, discoveredAt: startTs });
  if (!parseResult.ok) {
    registry.emit('HOT_RELOAD_FAILED', { path: filePath, stage: 'parse', error: parseResult.error });
    pushSSE('reload_failed', { path: filePath, stage: 'parse', error: parseResult.error });
    return { ok: false, stage: 'parse', error: parseResult.error };
  }

  const newCIO = parseResult.cio;
  globalStore.add(newCIO);

  // 4. Validate (all 4 layers)
  const allCIOs = globalStore.all();
  const vResult = validator.validate(newCIO, allCIOs);
  if (!vResult.passed) {
    const invalid = newCIO.withStatus('invalid');
    globalStore.add(invalid);
    registry.emit('HOT_RELOAD_REJECTED', { path: filePath, stage: 'validation', errors: vResult.errors });
    pushSSE('reload_rejected', { path: filePath, stage: 'validation', errors: vResult.errors });
    return { ok: false, stage: 'validation', errors: vResult.errors, warnings: vResult.warnings };
  }

  // 5. Score new CIO
  const scoreResult = scorer.score(newCIO, vResult, allCIOs);

  // 6. Namespace competition — does new CIO beat the current active for this namespace?
  const currentActive = globalStore.allActive()
    .find(c => c.namespace === newCIO.namespace && c.type === newCIO.type);

  if (currentActive && currentActive.hash !== newCIO.hash) {
    const currentScore = scorer.score(currentActive, null, allCIOs);
    const scoreMap     = new Map([
      [newCIO.hash,      scoreResult.score],
      [currentActive.hash, currentScore.score],
    ]);
    const resolved = resolver.resolveNamespaceConflict([newCIO, currentActive], scoreMap);
    const winner   = resolved?.winner || newCIO;

    if (winner.hash !== newCIO.hash) {
      // New config lost the competition — keep existing
      registry.emit('HOT_RELOAD_REJECTED', {
        path: filePath, stage: 'selection', reason: 'existing-config-wins',
        existingScore: currentScore.score, newScore: scoreResult.score,
      });
      pushSSE('reload_rejected', { path: filePath, stage: 'selection', existingScore: currentScore.score, newScore: scoreResult.score });
      return { ok: false, stage: 'selection', reason: 'existing-config-wins', scores: { existing: currentScore.score, new: scoreResult.score } };
    }
  }

  // 7. Sandbox simulation
  const sbResult = sandbox.simulate(newCIO);
  if (!sbResult.passed) {
    const invalid = newCIO.withStatus('invalid');
    globalStore.add(invalid);
    registry.emit('HOT_RELOAD_REJECTED', { path: filePath, stage: 'sandbox', errors: sbResult.errors });
    pushSSE('reload_rejected', { path: filePath, stage: 'sandbox', errors: sbResult.errors });
    return { ok: false, stage: 'sandbox', errors: sbResult.errors };
  }

  // 8. Encrypt plaintext secrets before activation
  if (type === 'secret') {
    const { encryptedCount } = secrets_.encryptCIO(newCIO);
    if (encryptedCount > 0) console.log(`[HOT-RELOAD] Encrypted ${encryptedCount} secret(s) in ${newCIO.namespace}`);
  }

  // 9. Atomic swap — supersede previous active, activate new
  if (currentActive) {
    globalStore.add(currentActive.withStatus('superseded'));
  }
  const activated = newCIO.withStatus('active', { activeSince: Date.now(), score: scoreResult.score });
  globalStore.add(activated);

  // 10. Rebuild merged state + snapshot
  const merged = rebuildMerged();
  snapshot.save(merged, globalStore.all().map(c => c.toJSON()));

  // Prune old versions after activation
  globalStore.prune(3);

  const elapsed = Date.now() - startTs;

  registry.emit('CIO_ACTIVATED', {
    cioId:      activated.id,
    namespace:  activated.namespace,
    mergedState: merged,
    trigger:    'hot-reload',
    elapsed,
  }, activated.hash);

  registry.emit('HOT_RELOAD_COMPLETE', {
    path:       filePath,
    namespace:  newCIO.namespace,
    type:       newCIO.type,
    hash:       newCIO.hash,
    score:      scoreResult.score,
    superseded: currentActive?.id || null,
    elapsed,
  });

  pushSSE('reload_complete', {
    namespace: newCIO.namespace,
    type:      newCIO.type,
    hash:      newCIO.hash,
    score:     scoreResult.score,
    elapsed,
    warnings:  sbResult.warnings,
  });

  console.log(`[HOT-RELOAD] ✓ ${newCIO.namespace} (${newCIO.type}) activated — score: ${scoreResult.score}/100 — ${elapsed}ms`);

  return {
    ok:        true,
    action:    'activated',
    cio:       activated.toJSON(),
    score:     scoreResult.score,
    superseded: currentActive?.id || null,
    elapsed,
    warnings:  [...vResult.warnings, ...sbResult.warnings],
    merged,
  };
}

// ── Process a deleted file ────────────────────────────────────────────────────
async function processDeletion(filePath) {
  const activeCIO = globalStore.allActive().find(c => c.source === filePath);
  if (!activeCIO) {
    registry.emit('HOT_RELOAD_DELETE_NOOP', { path: filePath, reason: 'no-active-cio-for-source' });
    return { ok: true, action: 'noop', reason: 'no active CIO matched this source' };
  }

  globalStore.add(activeCIO.withStatus('superseded'));

  const merged = rebuildMerged();
  snapshot.save(merged, globalStore.all().map(c => c.toJSON()));

  registry.emit('CIO_DEACTIVATED', {
    cioId:     activeCIO.id,
    namespace: activeCIO.namespace,
    reason:    'source-deleted',
  }, activeCIO.hash);

  pushSSE('reload_deleted', { namespace: activeCIO.namespace, type: activeCIO.type, path: filePath });

  console.log(`[HOT-RELOAD] ⚠ ${activeCIO.namespace} deactivated — source file deleted`);

  return { ok: true, action: 'deactivated', namespace: activeCIO.namespace };
}

module.exports = {
  processChange, processDeletion,
  registerSSEClient, unregisterSSEClient,
  rebuildMerged,
};
