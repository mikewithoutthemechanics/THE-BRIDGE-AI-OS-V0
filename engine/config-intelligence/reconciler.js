// =============================================================================
// BRIDGE AI OS — Continuous Reconciliation Loop  v2
//
// Fixes vs v1:
//   - Parser dedup means unchanged files skip the full parse pipeline (O(1))
//   - Only activates CIOs whose hash differs from the currently active CIO
//     for that namespace — stops the every-cycle re-activation flood
//   - globalStore.prune() called after each cycle to prevent memory growth
//   - Watcher integration: hot-reload handles instant changes; reconciler
//     is now a safety net (catches renames, bulk edits, mount points)
//
// The two-tier design:
//   Tier 1 (watcher + hot-reload): instant, per-file, ~300ms latency
//   Tier 2 (reconciler):           60s safety net for edge cases watcher misses
// =============================================================================
'use strict';

const registry   = require('./registry');
const discovery  = require('./discovery');
const parser     = require('./parser');
const validator  = require('./validator');
const scorer     = require('./scorer');
const resolver   = require('./resolver');
const sandbox    = require('./sandbox');
const drift      = require('./drift');
const healer     = require('./healer');
const anomaly    = require('./anomaly');
const snapshot   = require('./snapshot');
const { globalStore } = require('./cio');

const INTERVAL_MS       = parseInt(process.env.CONFIG_ENGINE_RECONCILE_INTERVAL_MS) || 60_000;
const ANOMALY_INTERVAL_MS = parseInt(process.env.CONFIG_ENGINE_ANOMALY_INTERVAL_MS) || 30_000;
const PRUNE_KEEP        = parseInt(process.env.CONFIG_ENGINE_PRUNE_KEEP) || 3;

let _reconcileTimer  = null;
let _anomalyTimer    = null;
let _state           = 'idle';
let _lastFingerprint = null;
let _lastSelected    = null;
let _runCount        = 0;
let _lastResult      = null;

// No module-level isAlreadyActive — use snapshot captured before the pipeline runs

// ── Single reconciliation cycle ───────────────────────────────────────────────
async function runCycle() {
  if (_state !== 'idle') {
    registry.emit('RECONCILE_SKIPPED', { reason: `already in state: ${_state}`, runCount: _runCount });
    return _lastResult;
  }

  _runCount++;
  _state = 'scanning';
  registry.emit('RECONCILE_START', { runCount: _runCount });

  try {
    // Snapshot active hashes BEFORE the pipeline to reliably skip unchanged CIOs
    const activeHashesBefore = new Set(globalStore.allActive().map(c => c.hash));

    // 1. Discovery
    const discovered = discovery.discover();

    // 2. Parse — dedup in parser means cache hits return immediately
    _state = 'parsing';
    const parsed = parser.parseAll(discovered);
    const allCIOs = [...parsed.configs, ...parsed.vars, ...parsed.secrets];
    for (const cio of allCIOs) globalStore.add(cio);

    // 3. Validate
    _state = 'validating';
    const validationResults = validator.validateAll(parsed);

    // 4. Score
    _state = 'scoring';
    const scoredResults = scorer.scoreAll(parsed, validationResults);

    // 5. Resolve conflicts + select
    _state = 'selecting';
    const selected = resolver.resolveAll(parsed, scoredResults);

    // 6. Sandbox simulation on winners only
    const allSelected = [...selected.configs, ...selected.vars, ...selected.secrets];
    const sandboxFails = allSelected
      .map(cio => ({ cio, result: sandbox.simulate(cio) }))
      .filter(({ result }) => !result.passed);
    const sandboxFailHashes = new Set(sandboxFails.map(({ cio }) => cio.hash));

    // 7. Drift check
    _state = 'reconciling';
    const activeCIOs    = globalStore.allActive();
    const activeVarCIOs = activeCIOs.filter(c => c.type === 'var');
    const driftReport   = drift.scan(activeCIOs, activeVarCIOs, _lastFingerprint);
    _lastFingerprint    = driftReport.fingerprint;

    // 8. Heal if needed
    if (driftReport.drifted) {
      await healer.heal(driftReport);
    }

    // 9. Merge to state
    const merged = resolver.mergeToState(selected);

    // 10. Activate — ONLY if hash wasn't already active when this cycle started
    let newActivations = 0;
    for (const cio of allSelected) {
      if (sandboxFailHashes.has(cio.hash)) continue;
      if (activeHashesBefore.has(cio.hash)) continue;  // ← already active, skip

      const activated = cio.withStatus('active', { activeSince: Date.now() });
      globalStore.add(activated);
      registry.emit('CIO_ACTIVATED', {
        cioId:       activated.id,
        namespace:   activated.namespace,
        mergedState: merged,
        trigger:     'reconciler',
      }, activated.hash);
      newActivations++;
    }

    // 11. Snapshot + prune
    const cioMeta = globalStore.all().map(c => c.toJSON());
    snapshot.save(merged, cioMeta);
    const pruned = globalStore.prune(PRUNE_KEEP);

    _lastSelected = selected;
    _state = 'idle';

    _lastResult = { ok: true, selected, merged, driftReport, scoredResults, validationResults };

    registry.emit('RECONCILE_COMPLETE', {
      runCount:        _runCount,
      configs:         selected.configs.length,
      vars:            selected.vars.length,
      secrets:         selected.secrets.length,
      newActivations,
      drifted:         driftReport.drifted,
      sandboxFails:    sandboxFails.length,
      validationFails: validationResults.failed.length,
      cacheHits:       parsed.cacheHits || 0,
      pruned,
    });

    return _lastResult;

  } catch (err) {
    _state = 'idle';
    registry.emit('RECONCILE_ERROR', { runCount: _runCount, error: err.message });
    console.error('[RECONCILER] Cycle error:', err.message);
    return { ok: false, error: err.message };
  }
}

// ── Anomaly scan ──────────────────────────────────────────────────────────────
function runAnomalyScan() {
  const report = anomaly.scan();
  if (report.critical > 0) {
    console.error(`[CONFIG ENGINE] ${report.critical} critical anomalies detected`);
  }
  return report;
}

// ── Start loop ────────────────────────────────────────────────────────────────
function start() {
  if (_reconcileTimer) return;

  registry.emit('RECONCILER_STARTED', { intervalMs: INTERVAL_MS });

  // Run at startup (watcher handles real-time; this is the safety-net baseline)
  runCycle().catch(err => console.error('[RECONCILER] startup error:', err.message));

  _reconcileTimer = setInterval(() => {
    runCycle().catch(err => console.error('[RECONCILER] cycle error:', err.message));
  }, INTERVAL_MS);

  _anomalyTimer = setInterval(runAnomalyScan, ANOMALY_INTERVAL_MS);
}

function stop() {
  if (_reconcileTimer) { clearInterval(_reconcileTimer); _reconcileTimer = null; }
  if (_anomalyTimer)   { clearInterval(_anomalyTimer);   _anomalyTimer   = null; }
  registry.emit('RECONCILER_STOPPED', { runCount: _runCount });
}

function status() {
  return {
    state:         _state,
    running:       !!_reconcileTimer,
    runCount:      _runCount,
    intervalMs:    INTERVAL_MS,
    storeStats:    globalStore.stats(),
    lastSelected:  _lastSelected ? {
      configs: _lastSelected.configs?.length,
      vars:    _lastSelected.vars?.length,
      secrets: _lastSelected.secrets?.length,
    } : null,
  };
}

module.exports = { start, stop, runCycle, runAnomalyScan, status };
