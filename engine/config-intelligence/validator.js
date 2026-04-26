// =============================================================================
// BRIDGE AI OS — Multi-Layer Validation Stack
//
// Four validation layers, each builds on the previous:
//   Layer 1 — Schema:    required fields, type checks, structural integrity
//   Layer 2 — Semantic:  business rules, value constraints, format checks
//   Layer 3 — Context:   cross-file compatibility, namespace conflicts
//   Layer 4 — Runtime:   execution readiness, dependency availability
//
// A CIO must pass ALL layers to become 'valid'. Any failure tags it 'invalid'.
// =============================================================================
'use strict';

const registry = require('./registry');

// ── Layer 1: Schema Validation ────────────────────────────────────────────────
function validateSchema(cio) {
  const errors = [];
  const p = cio.payload;

  if (!p.version)                         errors.push('missing: version');
  if (!p.namespace)                        errors.push('missing: namespace');
  if (!/^\d+\.\d+\.\d+$/.test(p.version)) errors.push(`invalid version format: ${p.version}`);
  if (!/^[a-z][a-z0-9.]*[a-z0-9]$/.test(p.namespace)) {
    errors.push(`invalid namespace format: ${p.namespace}`);
  }

  if (cio.type === 'config') {
    if (typeof p.payload !== 'object' || p.payload === null) errors.push('payload must be an object');
    if (typeof p.priority !== 'number') errors.push('priority must be a number');
  }
  if (cio.type === 'var') {
    if (typeof p.variables !== 'object' || p.variables === null) errors.push('variables must be an object');
    // Each variable must have a type
    for (const [k, v] of Object.entries(p.variables || {})) {
      if (!v.type) errors.push(`variable ${k}: missing type`);
    }
  }
  if (cio.type === 'secret') {
    if (typeof p.secrets !== 'object' || p.secrets === null) errors.push('secrets must be an object');
    // Each secret must have either encrypted or plaintext
    for (const [k, v] of Object.entries(p.secrets || {})) {
      if (!v.encrypted && !v.plaintext) errors.push(`secret ${k}: neither encrypted nor plaintext provided`);
    }
  }

  return { layer: 1, name: 'schema', passed: errors.length === 0, errors };
}

// ── Layer 2: Semantic Validation ──────────────────────────────────────────────
function validateSemantic(cio) {
  const errors = [];
  const p = cio.payload;

  // Version must be >= 1.0.0
  const [major] = (p.version || '0').split('.').map(Number);
  if (major < 1) errors.push(`version must be >= 1.0.0, got ${p.version}`);

  if (cio.type === 'config') {
    if (p.priority < 0 || p.priority > 1000) errors.push(`priority out of range [0,1000]: ${p.priority}`);
    if (p.payload && Object.keys(p.payload).length === 0) {
      errors.push('config payload is empty — no effect');
    }
  }

  if (cio.type === 'var') {
    for (const [k, v] of Object.entries(p.variables || {})) {
      const allowedTypes = ['string', 'number', 'boolean', 'json', 'array', 'url', 'email', 'path'];
      if (!allowedTypes.includes(v.type)) {
        errors.push(`variable ${k}: unknown type "${v.type}"`);
      }
      if (v.type === 'url' && v.default && !v.default.startsWith('http')) {
        errors.push(`variable ${k}: default URL does not start with http`);
      }
    }
  }

  if (cio.type === 'secret') {
    for (const [k, v] of Object.entries(p.secrets || {})) {
      if (v.plaintext && v.plaintext.length < 8) {
        errors.push(`secret ${k}: plaintext too short (< 8 chars) — likely not a real secret`);
      }
      const rotationDays = parseInt(v.rotation_policy);
      if (!isNaN(rotationDays) && rotationDays > 365) {
        errors.push(`secret ${k}: rotation policy exceeds 365 days — security risk`);
      }
    }
  }

  return { layer: 2, name: 'semantic', passed: errors.length === 0, errors };
}

// ── Layer 3: Context Validation (cross-file checks) ───────────────────────────
function validateContext(cio, allCIOs) {
  const errors = [];

  // Check for namespace collision
  const sameNs = allCIOs.filter(c => c.namespace === cio.namespace && c.hash !== cio.hash);
  if (sameNs.length > 0) {
    // Not an error — resolver handles conflicts — but log the collision
    errors.push(`namespace collision: ${sameNs.length} other CIO(s) share namespace ${cio.namespace}`);
    // This is a WARNING not a hard failure — mark as warning
    return { layer: 3, name: 'context', passed: true, warnings: errors, errors: [] };
  }

  // If a config's payload references a variable namespace, the var CIO must exist
  if (cio.type === 'config' && cio.payload.requires_vars) {
    for (const varNs of cio.payload.requires_vars) {
      const hasVar = allCIOs.some(c => c.type === 'var' && c.namespace === varNs);
      if (!hasVar) errors.push(`required var namespace not found: ${varNs}`);
    }
  }

  return { layer: 3, name: 'context', passed: errors.length === 0, errors, warnings: [] };
}

// ── Layer 4: Runtime Validation ───────────────────────────────────────────────
function validateRuntime(cio) {
  const errors = [];

  if (cio.type === 'var') {
    // Required variables without defaults must be resolvable from process.env
    for (const [k, v] of Object.entries(cio.payload.variables || {})) {
      if (v.required && v.default === null && !process.env[k]) {
        errors.push(`required variable ${k} has no default and is not set in environment`);
      }
    }
  }

  if (cio.type === 'secret') {
    // All secrets that are still plaintext have NOT been encrypted — warn
    for (const [k, v] of Object.entries(cio.payload.secrets || {})) {
      if (v.plaintext && !v.encrypted) {
        errors.push(`secret ${k} is stored as plaintext — will be encrypted before activation`);
      }
    }
    // Runtime errors here are treated as warnings — encryption happens in secrets manager
    return { layer: 4, name: 'runtime', passed: true, warnings: errors, errors: [] };
  }

  return { layer: 4, name: 'runtime', passed: errors.length === 0, errors, warnings: [] };
}

// ── Full validation pipeline ──────────────────────────────────────────────────
function validate(cio, allCIOs = []) {
  const layers = [
    validateSchema(cio),
    validateSemantic(cio),
    validateContext(cio, allCIOs),
    validateRuntime(cio),
  ];

  const allPassed  = layers.every(l => l.passed);
  const allErrors  = layers.flatMap(l => l.errors  || []);
  const allWarnings = layers.flatMap(l => l.warnings || []);

  const result = {
    cioHash:  cio.hash,
    cioId:    cio.id,
    type:     cio.type,
    namespace: cio.namespace,
    passed:   allPassed,
    layers,
    errors:   allErrors,
    warnings: allWarnings,
    validatedAt: Date.now(),
  };

  registry.emit(
    allPassed ? 'VALIDATION_PASSED' : 'VALIDATION_FAILED',
    { namespace: cio.namespace, errors: allErrors, warnings: allWarnings },
    cio.hash
  );

  return result;
}

// ── Batch validation ──────────────────────────────────────────────────────────
function validateAll(cioSets) {
  const allCIOs = [...(cioSets.configs || []), ...(cioSets.vars || []), ...(cioSets.secrets || [])];
  const results = { passed: [], failed: [], warnings: [] };

  for (const cio of allCIOs) {
    const r = validate(cio, allCIOs);
    if (r.passed) results.passed.push(r);
    else          results.failed.push(r);
    if (r.warnings.length > 0) results.warnings.push({ cioId: cio.id, warnings: r.warnings });
  }

  return results;
}

module.exports = { validate, validateAll, validateSchema, validateSemantic, validateContext, validateRuntime };
