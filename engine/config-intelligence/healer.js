// =============================================================================
// BRIDGE AI OS — Auto-Healing Engine
//
// Responds to drift events and validation failures.
// Healing strategies (in order of preference):
//   1. Re-scan + re-validate (soft heal)
//   2. Re-select from same-namespace alternatives
//   3. Rollback to previous snapshot state
//   4. Emit DEGRADED event (manual intervention required)
//
// All healing actions are logged. No silent recovery.
// =============================================================================
'use strict';

const registry  = require('./registry');
const snapshot  = require('./snapshot');
const discovery = require('./discovery');
const parser    = require('./parser');
const validator = require('./validator');
const scorer    = require('./scorer');
const resolver  = require('./resolver');
const sandbox   = require('./sandbox');

// ── Strategy 1: Soft heal — re-scan and re-apply ──────────────────────────────
async function softHeal(engineContext) {
  registry.emit('HEAL_START', { strategy: 'soft-heal' });

  try {
    const discovered = discovery.discover();
    const parsed     = parser.parseAll(discovered);
    const validated  = validator.validateAll(parsed);
    const scored     = scorer.scoreAll(parsed, validated);
    const selected   = resolver.resolveAll(parsed, scored);

    // Run sandbox checks on newly selected CIOs
    const allNew = [...selected.configs, ...selected.vars, ...selected.secrets];
    const sandboxResults = allNew.map(cio => sandbox.simulate(cio));
    const sandboxFails = sandboxResults.filter(r => !r.passed);

    if (sandboxFails.length > 0) {
      registry.emit('HEAL_SOFT_PARTIAL', {
        sandboxFailCount: sandboxFails.length,
        message: 'soft heal completed with sandbox failures',
      });
    }

    const merged = resolver.mergeToState(selected);

    registry.emit('HEALED', {
      strategy:    'soft-heal',
      configCount: selected.configs.length,
      varCount:    selected.vars.length,
      secretCount: selected.secrets.length,
    });

    return { ok: true, strategy: 'soft-heal', selected, merged };

  } catch (err) {
    registry.emit('HEAL_FAILED', { strategy: 'soft-heal', error: err.message });
    return { ok: false, strategy: 'soft-heal', error: err.message };
  }
}

// ── Strategy 2: Rollback to last known-good snapshot ─────────────────────────
function rollback() {
  registry.emit('HEAL_START', { strategy: 'rollback' });

  const archiveList = snapshot.listArchive();
  if (archiveList.length < 2) {
    // No previous snapshot to roll back to
    registry.emit('HEAL_FAILED', { strategy: 'rollback', reason: 'no-archive-available' });
    return { ok: false, strategy: 'rollback', error: 'no archive snapshot available' };
  }

  // Try the second-most-recent archive (most recent may be the corrupt one)
  for (let i = 1; i < Math.min(archiveList.length, 4); i++) {
    const candidate = snapshot.loadArchived(archiveList[i].ts);
    if (candidate.ok) {
      registry.emit('HEALED', {
        strategy:    'rollback',
        restoredTs:  archiveList[i].ts,
        archiveIndex: i,
      });
      return { ok: true, strategy: 'rollback', snapshot: candidate.snapshot, ts: archiveList[i].ts };
    }
  }

  registry.emit('HEAL_FAILED', { strategy: 'rollback', reason: 'all-archive-snapshots-corrupted' });
  return { ok: false, strategy: 'rollback', error: 'all archive snapshots failed integrity check' };
}

// ── Strategy 3: Emergency degraded mode ──────────────────────────────────────
function enterDegradedMode(reason) {
  registry.emit('SYSTEM_DEGRADED', { reason, ts: Date.now() });
  console.error(`[CONFIG ENGINE] DEGRADED: ${reason} — manual intervention required`);
  return { ok: false, strategy: 'degraded', degraded: true, reason };
}

// ── Heal based on drift report ────────────────────────────────────────────────
async function heal(driftReport, engineContext = null) {
  if (!driftReport.drifted) {
    return { ok: true, action: 'none', reason: 'no-drift' };
  }

  const { fileChanges, cioDrift, envDrift } = driftReport;

  // Classify severity
  const hasDeletedSources = cioDrift.some(d => d.type === 'source-deleted');
  const hasModifiedSources = cioDrift.some(d => d.type === 'source-modified');
  const envMissing = envDrift.length > 0;

  if (hasDeletedSources || hasModifiedSources || fileChanges.length > 0) {
    // Attempt soft heal first
    const result = await softHeal(engineContext);
    if (result.ok) return result;

    // Soft heal failed — try rollback
    return rollback();
  }

  if (envMissing) {
    // Environment vars missing — can't auto-fix, degrade
    const missing = envDrift.map(d => d.key).join(', ');
    return enterDegradedMode(`required env vars missing: ${missing}`);
  }

  return { ok: true, action: 'none', reason: 'drift-benign' };
}

module.exports = { heal, softHeal, rollback, enterDegradedMode };
