// =============================================================================
// BRIDGE AI OS — Anomaly Detection Engine
//
// Monitors the event stream and CIO state for unusual patterns.
// Detects:
//   - Rapid config churn (too many changes in short time window)
//   - Repeated validation failures for same namespace
//   - Sudden score degradation
//   - Unusual secret access patterns
//   - Multiple sandbox failures
//   - Chain integrity breaks in the registry
// =============================================================================
'use strict';

const registry = require('./registry');

// ── Anomaly thresholds ────────────────────────────────────────────────────────
const THRESHOLDS = {
  churnWindowMs:        5 * 60 * 1000,  // 5 minutes
  churnMaxChanges:      10,              // max file changes in window
  maxValidationFails:   3,              // per namespace per session
  maxSandboxFails:      3,              // total
  maxSecretAccessRate:  20,             // per minute
  scoreDegradePct:      30,             // % drop triggers anomaly
};

// ── Rapid config churn ────────────────────────────────────────────────────────
function detectChurn() {
  const window  = Date.now() - THRESHOLDS.churnWindowMs;
  const changes = registry.getEvents({ type: 'CIO_CREATED', since: window });
  const mutated = registry.getEvents({ type: 'CIO_MUTATED',  since: window });
  const total   = changes.length + mutated.length;

  if (total >= THRESHOLDS.churnMaxChanges) {
    return {
      type:     'RAPID_CHURN',
      severity: total >= THRESHOLDS.churnMaxChanges * 2 ? 'critical' : 'warning',
      message:  `${total} config changes in last 5 minutes`,
      count:    total,
    };
  }
  return null;
}

// ── Repeated validation failures ──────────────────────────────────────────────
function detectValidationFailureLoop() {
  const anomalies = [];
  const failures = registry.getEvents({ type: 'VALIDATION_FAILED' });

  // Count failures per namespace
  const counts = {};
  for (const f of failures) {
    const ns = f.data.namespace;
    counts[ns] = (counts[ns] || 0) + 1;
  }

  for (const [ns, count] of Object.entries(counts)) {
    if (count >= THRESHOLDS.maxValidationFails) {
      anomalies.push({
        type:      'REPEATED_VALIDATION_FAILURE',
        severity:  count >= 10 ? 'critical' : 'warning',
        namespace: ns,
        count,
        message:   `namespace ${ns} has failed validation ${count} times`,
      });
    }
  }
  return anomalies;
}

// ── Sandbox failure cluster ───────────────────────────────────────────────────
function detectSandboxFailureCluster() {
  const recentFails = registry.getEvents({
    type:  'SANDBOX_FAILED',
    since: Date.now() - THRESHOLDS.churnWindowMs,
  });

  if (recentFails.length >= THRESHOLDS.maxSandboxFails) {
    return {
      type:     'SANDBOX_FAILURE_CLUSTER',
      severity: 'critical',
      count:    recentFails.length,
      message:  `${recentFails.length} sandbox failures in last 5 minutes`,
    };
  }
  return null;
}

// ── Unusual secret access pattern ────────────────────────────────────────────
function detectSecretAccessAnomaly() {
  const window   = 60 * 1000; // 1 minute
  const accesses = registry.getEvents({ type: 'SECRET_ACCESSED', since: Date.now() - window });
  const denied   = registry.getEvents({ type: 'SECRET_ACCESS_DENIED', since: Date.now() - window });

  const anomalies = [];

  if (accesses.length >= THRESHOLDS.maxSecretAccessRate) {
    anomalies.push({
      type:     'HIGH_SECRET_ACCESS_RATE',
      severity: 'warning',
      count:    accesses.length,
      message:  `${accesses.length} secret accesses in last minute`,
    });
  }

  if (denied.length > 0) {
    anomalies.push({
      type:     'SECRET_ACCESS_DENIED',
      severity: denied.length >= 3 ? 'critical' : 'warning',
      count:    denied.length,
      callers:  [...new Set(denied.map(e => e.data.callerId))],
      message:  `${denied.length} unauthorized secret access attempts`,
    });
  }

  return anomalies;
}

// ── Registry chain integrity ──────────────────────────────────────────────────
function detectChainBreak() {
  const chainResult = registry.verifyChain();
  if (!chainResult.valid) {
    return {
      type:      'REGISTRY_CHAIN_BREAK',
      severity:  'critical',
      brokenAt:  chainResult.brokenAt,
      message:   `Registry chain broken at event ${chainResult.brokenAt} — potential tampering`,
    };
  }
  return null;
}

// ── Full anomaly scan ─────────────────────────────────────────────────────────
function scan() {
  const anomalies = [];

  const churn = detectChurn();
  if (churn) anomalies.push(churn);

  anomalies.push(...detectValidationFailureLoop());

  const sandboxCluster = detectSandboxFailureCluster();
  if (sandboxCluster) anomalies.push(sandboxCluster);

  anomalies.push(...detectSecretAccessAnomaly());

  const chainBreak = detectChainBreak();
  if (chainBreak) anomalies.push(chainBreak);

  const criticalCount = anomalies.filter(a => a.severity === 'critical').length;

  if (anomalies.length > 0) {
    registry.emit('ANOMALIES_DETECTED', {
      total:    anomalies.length,
      critical: criticalCount,
      types:    anomalies.map(a => a.type),
    });
  }

  return {
    anomalies,
    critical:   criticalCount,
    warnings:   anomalies.length - criticalCount,
    scannedAt:  Date.now(),
  };
}

module.exports = { scan, detectChurn, detectValidationFailureLoop, detectSandboxFailureCluster, detectSecretAccessAnomaly, detectChainBreak, THRESHOLDS };
