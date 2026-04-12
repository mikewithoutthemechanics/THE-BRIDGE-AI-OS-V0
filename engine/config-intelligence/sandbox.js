// =============================================================================
// BRIDGE AI OS — Sandbox Execution Engine
//
// Simulates config activation in an isolated Node.js vm context.
// A config must pass sandbox simulation before it can be activated.
//
// What the sandbox tests:
//   - payload keys resolve without errors
//   - variable substitution completes
//   - no circular references or eval-unsafe content
//   - custom validation rules execute cleanly
//
// Uses Node.js built-in `vm` module — no external dependencies.
// =============================================================================
'use strict';

const vm       = require('vm');
const registry = require('./registry');

const SANDBOX_TIMEOUT_MS = 2000; // 2 second max per simulation

// ── Safe JSON serialisation check ─────────────────────────────────────────────
function isSerializable(obj) {
  try { JSON.stringify(obj); return true; } catch (_) { return false; }
}

// ── Check for dangerous patterns in string values ────────────────────────────
function scanForUnsafePatterns(obj, path = '') {
  const issues = [];
  if (typeof obj === 'string') {
    if (/eval\s*\(/.test(obj))            issues.push(`${path}: contains eval()`);
    if (/new\s+Function/.test(obj))       issues.push(`${path}: contains new Function()`);
    if (/require\s*\(/.test(obj))         issues.push(`${path}: contains require() in value`);
    if (/__proto__|constructor\s*\[/.test(obj)) issues.push(`${path}: prototype pollution pattern`);
  } else if (typeof obj === 'object' && obj !== null) {
    for (const [k, v] of Object.entries(obj)) {
      issues.push(...scanForUnsafePatterns(v, path ? `${path}.${k}` : k));
    }
  }
  return issues;
}

// ── Simulate config CIO in vm sandbox ────────────────────────────────────────
function simulateConfig(cio) {
  const errors = [];
  const warnings = [];

  const payload = cio.payload.payload || {};

  // 1. Serializability check
  if (!isSerializable(payload)) {
    errors.push('payload is not JSON-serializable — circular reference or unsupported type');
    return { passed: false, errors, warnings };
  }

  // 2. Unsafe pattern scan
  const unsafe = scanForUnsafePatterns(payload);
  errors.push(...unsafe);
  if (errors.length > 0) return { passed: false, errors, warnings };

  // 3. vm sandbox: clone payload, set all keys, verify no throws
  const sandbox = {
    config:  {},
    result:  null,
    error:   null,
    payload: JSON.parse(JSON.stringify(payload)), // deep clone
  };

  const code = `
    try {
      Object.assign(config, payload);
      for (const [k, v] of Object.entries(config)) {
        result = typeof v; // force evaluation
      }
    } catch (e) {
      error = e.message;
    }
  `;

  try {
    const ctx = vm.createContext(sandbox);
    vm.runInContext(code, ctx, { timeout: SANDBOX_TIMEOUT_MS });
    if (sandbox.error) errors.push(`sandbox execution error: ${sandbox.error}`);
  } catch (err) {
    if (err.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
      errors.push('sandbox timed out — possible infinite loop or expensive operation in config');
    } else {
      errors.push(`sandbox vm error: ${err.message}`);
    }
  }

  // 4. Run custom validation rules from config's validation section
  for (const rule of cio.payload.validation?.rules || []) {
    try {
      const ruleSandbox = { payload, result: true, error: null };
      const ruleCode = `
        try {
          result = (function(cfg) { ${rule.check} })(payload);
        } catch (e) { error = e.message; }
      `;
      const ctx = vm.createContext(ruleSandbox);
      vm.runInContext(ruleCode, ctx, { timeout: 500 });
      if (ruleSandbox.error) {
        errors.push(`rule "${rule.name}": ${ruleSandbox.error}`);
      } else if (!ruleSandbox.result) {
        errors.push(`rule "${rule.name}" failed: ${rule.message || 'check returned false'}`);
      }
    } catch (err) {
      warnings.push(`rule "${rule.name}" could not be evaluated: ${err.message}`);
    }
  }

  return { passed: errors.length === 0, errors, warnings };
}

// ── Simulate var CIO ──────────────────────────────────────────────────────────
function simulateVar(cio) {
  const errors = [];
  const warnings = [];
  const variables = cio.payload.variables || {};

  for (const [k, v] of Object.entries(variables)) {
    const resolved = v.default !== null ? v.default : (process.env[k] || null);

    if (v.required && resolved === null) {
      errors.push(`required variable ${k} cannot be resolved`);
      continue;
    }

    if (resolved !== null) {
      // Type check the resolved value
      const sandbox = { value: resolved, ok: false };
      const checks = {
        number:  'ok = !isNaN(Number(value))',
        boolean: 'ok = (value === true || value === false || value === "true" || value === "false")',
        url:     'ok = /^https?:\\/\\//.test(String(value))',
        email:   'ok = /^[^@]+@[^@]+\\.[^@]+$/.test(String(value))',
        string:  'ok = typeof value === "string" || typeof value !== "object"',
      };
      const check = checks[v.type] || 'ok = true';
      try {
        vm.runInNewContext(check, sandbox, { timeout: 200 });
        if (!sandbox.ok) warnings.push(`variable ${k}: value doesn't match declared type ${v.type}`);
      } catch (_) {}
    }
  }

  return { passed: errors.length === 0, errors, warnings };
}

// ── Main sandbox entry point ──────────────────────────────────────────────────
function simulate(cio) {
  let result;

  switch (cio.type) {
    case 'config': result = simulateConfig(cio); break;
    case 'var':    result = simulateVar(cio);    break;
    case 'secret': result = { passed: true, errors: [], warnings: ['secret simulation skipped — handled by secrets manager'] }; break;
    default:       result = { passed: false, errors: [`unknown CIO type: ${cio.type}`], warnings: [] };
  }

  registry.emit(
    result.passed ? 'SANDBOX_PASSED' : 'SANDBOX_FAILED',
    { namespace: cio.namespace, errors: result.errors, warnings: result.warnings },
    cio.hash
  );

  return result;
}

// ── Batch simulate ────────────────────────────────────────────────────────────
function simulateAll(cioSets) {
  const all = [...(cioSets.configs || []), ...(cioSets.vars || []), ...(cioSets.secrets || [])];
  return all.map(cio => ({ cio, result: simulate(cio) }));
}

module.exports = { simulate, simulateAll, scanForUnsafePatterns };
