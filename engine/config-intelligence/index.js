// =============================================================================
// BRIDGE AI OS — Config Intelligence Engine
// ─────────────────────────────────────────────────────────────────────────────
// Entry point for the full 20-module config management system.
//
// Lifecycle:
//   1. Start session in registry
//   2. Load prior snapshot (fast-forward)
//   3. Replay events since snapshot
//   4. Run deterministic startup protocol (discover → parse → validate → score → select → activate)
//   5. Start continuous reconciliation loop
//   6. Expose engine API
//
// Usage (in server.js):
//   const configEngine = require('./engine/config-intelligence');
//   await configEngine.start();
// =============================================================================
'use strict';

const registry    = require('./registry');
const discovery   = require('./discovery');
const parser      = require('./parser');
const validator   = require('./validator');
const scorer      = require('./scorer');
const resolver    = require('./resolver');
const sandbox_    = require('./sandbox');
const secrets_    = require('./secrets');
const snapshot    = require('./snapshot');
const replay      = require('./replay');
const drift       = require('./drift');
const healer      = require('./healer');
const reconciler  = require('./reconciler');
const anomaly     = require('./anomaly');
const dependency  = require('./dependency');
const lineage     = require('./lineage');
const convention  = require('./convention');
const docs        = require('./docs');
const { globalStore } = require('./cio');

let _started       = false;
let _engineState   = {};
let _startupResult = null;

// ── Deterministic Startup Protocol ───────────────────────────────────────────
async function start(opts = {}) {
  if (_started) return _startupResult;

  const { enableReconciler = true, silent = false } = opts;

  if (!silent) console.log('[CONFIG ENGINE] Starting Bridge AI OS Config Intelligence Engine...');

  // 1. Start session
  registry.startSession({ process: 'config-engine', pid: process.pid });

  // 2. Load snapshot (fast-forward)
  const snap = snapshot.load();
  if (snap.ok) {
    if (!silent) console.log(`[CONFIG ENGINE] Loaded snapshot from ${new Date(snap.snapshot.savedAt).toISOString()}`);
  }

  // 3. Replay events
  const replayState = replay.replay({ fromSnapshot: snap.ok, verbose: !silent });
  if (!silent) console.log(`[CONFIG ENGINE] Replayed ${replayState.replayedCount} events`);

  // 4. Discover
  const discovered = discovery.discover();
  if (!silent) console.log(`[CONFIG ENGINE] Discovered: ${discovered.configs.length} configs, ${discovered.vars.length} vars, ${discovered.secrets.length} secrets, ${discovered.quarantined.length} quarantined`);

  // 5. Parse
  const parsed = parser.parseAll(discovered);
  if (parsed.errors.length > 0) {
    console.warn(`[CONFIG ENGINE] ${parsed.errors.length} parse error(s)`);
  }

  // 6. Validate (all 4 layers)
  const allCIOs = [...parsed.configs, ...parsed.vars, ...parsed.secrets];
  for (const cio of allCIOs) globalStore.add(cio);
  const validationResults = validator.validateAll(parsed);
  if (!silent) console.log(`[CONFIG ENGINE] Validation: ${validationResults.passed.length} passed, ${validationResults.failed.length} failed`);

  // 7. Score
  const scoredResults = scorer.scoreAll(parsed, validationResults);

  // 8. Resolve conflicts
  const selected = resolver.resolveAll(parsed, scoredResults);
  if (!silent) console.log(`[CONFIG ENGINE] Selected: ${selected.configs.length} configs, ${selected.vars.length} vars, ${selected.secrets.length} secrets (${selected.superseded.length} superseded)`);

  // 9. Sandbox simulation on all selected CIOs
  const allSelected = [...selected.configs, ...selected.vars, ...selected.secrets];
  const sandboxResults = allSelected.map(cio => ({ cio, result: sandbox_.simulate(cio) }));
  const sandboxPassed = sandboxResults.filter(({ result }) => result.passed);
  const sandboxFailed = sandboxResults.filter(({ result }) => !result.passed);
  if (sandboxFailed.length > 0) {
    console.warn(`[CONFIG ENGINE] ${sandboxFailed.length} CIO(s) failed sandbox — excluded from activation`);
  }

  // 10. Encrypt plaintext secrets before activation
  for (const cio of selected.secrets) {
    const { encryptedCount, updatedSecrets } = secrets_.encryptCIO(cio);
    if (encryptedCount > 0 && !silent) {
      console.log(`[CONFIG ENGINE] Encrypted ${encryptedCount} plaintext secret(s) in ${cio.namespace}`);
    }
  }

  // 11. Merge to state
  const merged = resolver.mergeToState(selected);

  // 12. Activate sandbox-passed CIOs
  const sandboxFailHashes = new Set(sandboxFailed.map(({ cio }) => cio.hash));
  let activated = 0;
  for (const cio of allSelected) {
    if (!sandboxFailHashes.has(cio.hash)) {
      const active = cio.withStatus('active', { activeSince: Date.now() });
      globalStore.add(active);
      registry.emit('CIO_ACTIVATED', {
        cioId:       active.id,
        namespace:   active.namespace,
        mergedState: merged,
      }, active.hash);
      activated++;
    }
  }

  // 13. Build dependency graph
  const depGraph = dependency.buildGraph(parsed);
  const { sorted: activationOrder, hasCycle } = dependency.topologicalSort(depGraph);
  if (hasCycle) console.warn('[CONFIG ENGINE] Circular dependency detected in config graph');

  // 14. Rotation check on secrets
  for (const cio of selected.secrets) {
    const overdue = secrets_.checkRotation(cio);
    if (overdue.length > 0) {
      console.warn(`[CONFIG ENGINE] ${overdue.length} secret(s) overdue for rotation in ${cio.namespace}`);
    }
  }

  // 15. Initial drift baseline
  const driftReport = drift.scan(globalStore.allActive(), selected.vars, null);

  // 16. Save snapshot
  const cioMeta = globalStore.all().map(c => c.toJSON());
  const snapResult = snapshot.save(merged, cioMeta);

  // 17. Initial anomaly scan
  const anomalyReport = anomaly.scan();

  _engineState = {
    activeCIOs: globalStore.allActive(),
    selected,
    merged,
    driftReport,
    anomalyReport,
    depGraph,
    activationOrder,
    snapshotHash: snapResult.hash,
  };

  _startupResult = {
    ok:               true,
    activated,
    validationFailed: validationResults.failed.length,
    sandboxFailed:    sandboxFailed.length,
    quarantined:      discovered.quarantined.length,
    snapshotHash:     snapResult.hash,
    anomalies:        anomalyReport.anomalies.length,
  };

  registry.emit('ENGINE_STARTED', _startupResult);

  if (!silent) {
    console.log(`[CONFIG ENGINE] ✓ Started — ${activated} CIOs active, snapshot: ${snapResult.hash?.slice(0, 12)}...`);
  }

  // 18. Start reconciliation loop
  if (enableReconciler) reconciler.start();

  _started = true;
  return _startupResult;
}

// ── Stop the engine ───────────────────────────────────────────────────────────
function stop() {
  reconciler.stop();
  registry.emit('ENGINE_STOPPED', { pid: process.pid });
  _started = false;
}

// ── Public read interface ─────────────────────────────────────────────────────
function getState()       { return _engineState; }
function getMerged()      { return _engineState.merged || {}; }
function isStarted()      { return _started; }

function getReport() {
  return docs.generateAll(
    _engineState,
    null,
    scorer.scoreAll(
      { configs: [], vars: [], secrets: [] },
      { passed: [], failed: [], warnings: [] }
    )
  );
}

function getDocs(format = 'summary') {
  if (format === 'summary')    return docs.systemSummary(_engineState);
  if (format === 'validation') return docs.validationReport({ passed: [], failed: [], warnings: [] });
  return docs.generateAll(_engineState, null, null);
}

// ── Module exports ────────────────────────────────────────────────────────────
module.exports = {
  start, stop,
  getState, getMerged, isStarted, getReport, getDocs,

  // Sub-module access (for API layer)
  registry, discovery, parser, validator, scorer, resolver,
  sandbox: sandbox_, secrets: secrets_, snapshot, replay,
  drift, healer, reconciler, anomaly, dependency, lineage, convention, docs,
  store: globalStore,
};
