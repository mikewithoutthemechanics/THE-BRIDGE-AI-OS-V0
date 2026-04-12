// =============================================================================
// BRIDGE AI OS — Continuous Reconciliation Loop
//
// Periodically re-scans filesystem, re-validates CIOs, detects drift,
// runs anomaly detection, and triggers healing if needed.
//
// The loop runs inside the Node.js process — no external cron required.
// Interval is configurable via CONFIG_ENGINE_RECONCILE_INTERVAL_MS (default: 60s)
//
// State machine:
//   IDLE → SCANNING → VALIDATING → SCORING → SELECTING → RECONCILING → IDLE
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

const INTERVAL_MS = parseInt(process.env.CONFIG_ENGINE_RECONCILE_INTERVAL_MS) || 60_000;
const ANOMALY_INTERVAL_MS = parseInt(process.env.CONFIG_ENGINE_ANOMALY_INTERVAL_MS) || 30_000;

let _reconcileTimer  = null;
let _anomalyTimer    = null;
let _state           = 'idle';
let _lastFingerprint = null;
let _lastSelected    = null;
let _runCount        = 0;

// ── Single reconciliation cycle ───────────────────────────────────────────────
async function runCycle() {
  if (_state !== 'idle') {
    registry.emit('RECONCILE_SKIPPED', { reason: `already in state: ${_state}` });
    return;
  }

  _runCount++;
  _state = 'scanning';
  registry.emit('RECONCILE_START', { runCount: _runCount });

  try {
    // 1. Discovery
    const discovered = discovery.discover();

    // 2. Parse
    _state = 'parsing';
    const parsed = parser.parseAll(discovered);
    const allCIOs = [...parsed.configs, ...parsed.vars, ...parsed.secrets];

    // Add all to global store
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

    // 6. Sandbox simulation on winners
    const allSelected = [...selected.configs, ...selected.vars, ...selected.secrets];
    const sandboxFails = allSelected
      .map(cio => ({ cio, result: sandbox.simulate(cio) }))
      .filter(({ result }) => !result.passed);

    // 7. Drift check
    _state = 'reconciling';
    const activeCIOs   = globalStore.allActive();
    const activeVarCIOs = activeCIOs.filter(c => c.type === 'var');
    const driftReport  = drift.scan(activeCIOs, activeVarCIOs, _lastFingerprint);
    _lastFingerprint   = driftReport.fingerprint;

    // 8. Heal if needed
    if (driftReport.drifted) {
      await healer.heal(driftReport);
    }

    // 9. Merge to state
    const merged = resolver.mergeToState(selected);

    // 10. Activate valid + sandbox-passed CIOs
    const sandboxFailHashes = new Set(sandboxFails.map(({ cio }) => cio.hash));
    for (const cio of allSelected) {
      if (!sandboxFailHashes.has(cio.hash)) {
        const activated = cio.withStatus('active', { activeSince: Date.now() });
        globalStore.add(activated);
        registry.emit('CIO_ACTIVATED', {
          cioId:       activated.id,
          namespace:   activated.namespace,
          mergedState: merged,
        }, activated.hash);
      }
    }

    // 11. Save snapshot after successful cycle
    const cioMeta = globalStore.all().map(c => c.toJSON());
    snapshot.save(merged, cioMeta);

    _lastSelected = selected;
    _state = 'idle';

    registry.emit('RECONCILE_COMPLETE', {
      runCount:        _runCount,
      configs:         selected.configs.length,
      vars:            selected.vars.length,
      secrets:         selected.secrets.length,
      drifted:         driftReport.drifted,
      sandboxFails:    sandboxFails.length,
      validationFails: validationResults.failed.length,
    });

    return { ok: true, selected, merged, driftReport, scoredResults, validationResults };

  } catch (err) {
    _state = 'idle';
    registry.emit('RECONCILE_ERROR', { runCount: _runCount, error: err.message, stack: err.stack });
    return { ok: false, error: err.message };
  }
}

// ── Anomaly scan (runs on separate shorter interval) ─────────────────────────
function runAnomalyScan() {
  const report = anomaly.scan();
  if (report.critical > 0) {
    console.error(`[CONFIG ENGINE] ${report.critical} critical anomalies detected`);
  }
  return report;
}

// ── Start the reconciliation loop ─────────────────────────────────────────────
function start() {
  if (_reconcileTimer) return; // already running

  registry.emit('RECONCILER_STARTED', { intervalMs: INTERVAL_MS });

  // Run immediately at startup
  runCycle().catch(err => console.error('[CONFIG ENGINE] startup cycle error:', err.message));

  _reconcileTimer = setInterval(() => {
    runCycle().catch(err => console.error('[CONFIG ENGINE] reconcile error:', err.message));
  }, INTERVAL_MS);

  _anomalyTimer = setInterval(runAnomalyScan, ANOMALY_INTERVAL_MS);
}

// ── Stop the loop ─────────────────────────────────────────────────────────────
function stop() {
  if (_reconcileTimer) { clearInterval(_reconcileTimer); _reconcileTimer = null; }
  if (_anomalyTimer)   { clearInterval(_anomalyTimer);   _anomalyTimer   = null; }
  registry.emit('RECONCILER_STOPPED', { runCount: _runCount });
}

function status() {
  return {
    state:       _state,
    running:     !!_reconcileTimer,
    runCount:    _runCount,
    intervalMs:  INTERVAL_MS,
    lastSelected: _lastSelected ? {
      configs: _lastSelected.configs?.length,
      vars:    _lastSelected.vars?.length,
      secrets: _lastSelected.secrets?.length,
    } : null,
  };
}

module.exports = { start, stop, runCycle, runAnomalyScan, status };
