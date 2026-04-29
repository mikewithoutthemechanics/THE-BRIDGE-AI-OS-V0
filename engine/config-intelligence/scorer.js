// =============================================================================
// BRIDGE AI OS — Config Intelligence Scoring Engine
//
// Scores each CIO on five dimensions, returns a 0-100 composite score.
//
// Dimensions:
//   1. Completeness   (0-25) — how fully populated the payload is
//   2. Validation     (0-25) — validation layers passed, warnings absent
//   3. Compatibility  (0-20) — no namespace collisions, deps satisfied
//   4. Freshness      (0-15) — how recently modified vs. last activation
//   5. Performance    (0-15) — historical: tasks completed, errors avoided
//
// The highest-scoring VALID CIO in each namespace wins selection.
// =============================================================================
'use strict';

const registry = require('./registry');

// ── Dimension 1: Completeness ─────────────────────────────────────────────────
function scoreCompleteness(cio) {
  const p = cio.payload;
  let score = 0;

  // Base fields (10 points)
  if (p.version)   score += 3;
  if (p.namespace) score += 3;
  if (p.meta && Object.keys(p.meta).length > 0) score += 2;
  if (p.tags && p.tags.length > 0) score += 2;

  // Type-specific content (15 points)
  if (cio.type === 'config') {
    const keys = Object.keys(p.payload || {}).length;
    score += Math.min(15, keys * 3);
  }
  if (cio.type === 'var') {
    const vars = Object.values(p.variables || {});
    const withDesc = vars.filter(v => v.description).length;
    score += Math.min(10, vars.length * 2);
    score += Math.min(5, withDesc * 2);
  }
  if (cio.type === 'secret') {
    const secrets = Object.values(p.secrets || {});
    const encrypted = secrets.filter(s => s.encrypted).length;
    score += Math.min(10, secrets.length * 2);
    score += encrypted === secrets.length ? 5 : 0; // bonus for all-encrypted
  }

  return Math.min(25, score);
}

// ── Dimension 2: Validation Score ────────────────────────────────────────────
function scoreValidation(validationResult) {
  if (!validationResult) return 0;

  const { layers, errors, warnings } = validationResult;
  const passedLayers = (layers || []).filter(l => l.passed).length;
  const totalLayers  = (layers || []).length || 4;

  let score = Math.round((passedLayers / totalLayers) * 20);

  // Penalise warnings (-1 each, max -5)
  score -= Math.min(5, (warnings || []).length);

  // Bonus for zero errors (perfect score)
  if ((errors || []).length === 0) score += 5;

  return Math.max(0, Math.min(25, score));
}

// ── Dimension 3: Compatibility ────────────────────────────────────────────────
function scoreCompatibility(cio, allCIOs) {
  let score = 20; // start at max, deduct for issues

  // Namespace collision: -5 per conflicting CIO (max -10)
  const collisions = allCIOs.filter(c => c.namespace === cio.namespace && c.hash !== cio.hash);
  score -= Math.min(10, collisions.length * 5);

  // Required vars satisfied
  if (cio.type === 'config' && cio.payload.requires_vars) {
    for (const varNs of cio.payload.requires_vars) {
      const found = allCIOs.some(c => c.type === 'var' && c.namespace === varNs && c.status !== 'invalid');
      if (!found) score -= 5;
    }
  }

  return Math.max(0, score);
}

// ── Dimension 4: Freshness ────────────────────────────────────────────────────
function scoreFreshness(cio) {
  const ageMs  = Date.now() - (cio.createdAt || 0);
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  // Fresher is better: full 15 points under 7 days, diminishes to 0 at 365 days
  const score = Math.max(0, 15 - Math.floor((ageDays / 365) * 15));
  return score;
}

// ── Dimension 5: Historical Performance ───────────────────────────────────────
function scorePerformance(cio) {
  // Look up past activation events for this logical identity (by id)
  const activations = registry.getEvents({ type: 'CIO_ACTIVATED' })
    .filter(e => e.data.cioId === cio.id);

  const errors = registry.getEvents({ type: 'RUNTIME_ERROR' })
    .filter(e => e.data.cioId === cio.id);

  if (activations.length === 0) return 10; // new configs get neutral score (not penalised)

  const successRate = (activations.length - errors.length) / activations.length;
  return Math.round(successRate * 15);
}

// ── Composite Score ───────────────────────────────────────────────────────────
function score(cio, validationResult, allCIOs = []) {
  const dimensions = {
    completeness:  scoreCompleteness(cio),
    validation:    scoreValidation(validationResult),
    compatibility: scoreCompatibility(cio, allCIOs),
    freshness:     scoreFreshness(cio),
    performance:   scorePerformance(cio),
  };

  const total = Object.values(dimensions).reduce((sum, v) => sum + v, 0);

  const result = {
    cioHash:    cio.hash,
    cioId:      cio.id,
    namespace:  cio.namespace,
    type:       cio.type,
    score:      total,
    max:        100,
    percentage: total,
    dimensions,
    scoredAt:   Date.now(),
  };

  registry.emit('CIO_SCORED', { namespace: cio.namespace, score: total, dimensions }, cio.hash);

  return result;
}

// ── Score all CIOs and return ranked list ─────────────────────────────────────
function scoreAll(cioSets, validationResults) {
  const allCIOs = [
    ...(cioSets.configs || []),
    ...(cioSets.vars    || []),
    ...(cioSets.secrets || []),
  ];

  const validMap = new Map(
    (validationResults.passed || []).map(r => [r.cioHash, r])
  );

  const scored = allCIOs.map(cio => {
    const vr = validMap.get(cio.hash) || null;
    return score(cio, vr, allCIOs);
  });

  // Sort descending by score
  return scored.sort((a, b) => b.score - a.score);
}

module.exports = { score, scoreAll, scoreCompleteness, scoreValidation, scoreCompatibility, scoreFreshness, scorePerformance };
