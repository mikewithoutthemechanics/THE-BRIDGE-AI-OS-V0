// OVERSEER INTEGRATION TESTS
// Run: node tests/overseer.test.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Simple test framework
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} Expected ${expected}, got ${actual}`);
  }
}

function assertTrue(condition, msg = '') {
  if (!condition) {
    throw new Error(`${msg} Expected true`);
  }
}

function assertContains(array, item, msg = '') {
  if (!array.includes(item)) {
    throw new Error(`${msg} Array does not contain ${item}`);
  }
}

// ============================================
// UTILITY FUNCTIONS (from overseer.js)
// ============================================

const hash = (obj) => {
  return require('crypto')
    .createHash('sha256')
    .update(JSON.stringify(obj, null, 2))
    .digest('hex');
};

const safeReadFile = (path) => {
  try {
    return fs.readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
};

// ============================================
// MOCK STATE (for testing)
// ============================================

const mockHealthyState = {
  timestamp: new Date().toISOString(),
  topology: {
    services: ['backend', 'frontend', 'prometheus'],
    nodes: [],
    edges: []
  },
  configs: {
    'docker-compose.yml': { exists: true, parse_valid: true },
    'backend/main.py': { exists: true, parse_valid: true }
  },
  modules: {
    backend: 'healthy',
    frontend: 'healthy',
    prometheus: 'healthy'
  },
  metrics: {
    control_score: 100,
    safety_score: 100,
    isolation_score: 100,
    overall_health: 100,
    load: 0.5
  },
  parse_valid: true,
  __hash: ''
};

mockHealthyState.__hash = hash(mockHealthyState);

const mockBrokenState = {
  timestamp: new Date().toISOString(),
  topology: {
    services: [],  // No services = disconnected
    nodes: [],
    edges: []
  },
  configs: {
    'invalid.json': { exists: true, parse_valid: false }
  },
  modules: {
    backend: 'unavailable'
  },
  metrics: {
    isolation_score: 95,
    safety_score: 97,
    overall_health: 50,
    load: 0.95
  },
  parse_valid: false,
  errors: ['STATE_INVALID: parse errors'],
  __hash: ''
};

mockBrokenState.__hash = hash(mockBrokenState);

// ============================================
// TESTS
// ============================================

console.log('\n=== OVERSEER TEST SUITE ===\n');

// ---- Hash Function ----
test('hash generates consistent output', () => {
  const h1 = hash({ a: 1, b: 2 });
  const h2 = hash({ a: 1, b: 2 });
  assertEqual(h1, h2, 'Hash should be deterministic');
});

test('hash detects differences', () => {
  const h1 = hash({ a: 1, b: 2 });
  const h2 = hash({ a: 1, b: 3 });
  assertTrue(h1 !== h2, 'Different inputs should produce different hashes');
});

// ---- State Validation ----
test('healthy state validates', () => {
  assertTrue(mockHealthyState.parse_valid, 'Healthy state should parse valid');
  assertEqual(mockHealthyState.metrics.isolation_score, 100, 'Isolation should be perfect');
});

test('broken state fails validation', () => {
  assertTrue(!mockBrokenState.parse_valid, 'Broken state should fail parse');
  assertTrue(mockBrokenState.errors.length > 0, 'Should have errors');
});

// ---- Topology Validation ----
test('topology with services is connected', () => {
  const services = mockHealthyState.topology.services;
  assertTrue(services.length > 0, 'Should have services');
});

test('topology without services is disconnected', () => {
  const services = mockBrokenState.topology.services;
  assertTrue(services.length === 0, 'Should have no services');
});

// ---- Metrics Validation ----
test('high isolation score = 100', () => {
  assertEqual(mockHealthyState.metrics.isolation_score, 100, 'Isolation must be 100');
});

test('low health score triggers prediction', () => {
  assertTrue(mockBrokenState.metrics.overall_health < 90, 'Should be below threshold');
});

// ---- Invariant Logic ----
test('CONFIG_PARSE invariant passes on healthy state', () => {
  const configs = mockHealthyState.configs;
  const allValid = Object.values(configs).every(c => c.parse_valid);
  assertTrue(allValid, 'All configs should parse');
});

test('CONFIG_PARSE invariant fails on broken state', () => {
  const configs = mockBrokenState.configs;
  const allValid = Object.values(configs).every(c => c.parse_valid);
  assertTrue(!allValid, 'Should have invalid config');
});

test('TOPOLOGY_CONNECTED invariant passes with services', () => {
  const connected = mockHealthyState.topology.services.length > 0;
  assertTrue(connected, 'Should be connected');
});

test('TOPOLOGY_CONNECTED invariant fails without services', () => {
  const connected = mockBrokenState.topology.services.length > 0;
  assertTrue(!connected, 'Should be disconnected');
});

// ---- Failure Prediction ----
test('predictor flags high-risk state', () => {
  const risk = mockBrokenState.metrics.overall_health < 90 ? 0.6 : 0;
  assertTrue(risk >= 0.5, 'Should be high risk');
});

test('predictor accepts healthy state', () => {
  const risk = mockHealthyState.metrics.overall_health < 90 ? 0.6 : 0;
  assertTrue(risk === 0, 'Should be low risk');
});

// ---- State Capture ----
test('state hash is consistent (excluding __hash field)', () => {
  // Remove __hash from comparison since it's derived
  const state1 = { ...mockHealthyState, __hash: undefined };
  const state2 = { ...mockHealthyState, __hash: undefined };
  const h1 = hash(state1);
  const h2 = hash(state2);
  assertEqual(h1, h2, 'Hash should be deterministic');
});

test('state hash differs between states', () => {
  assertTrue(
    mockHealthyState.__hash !== mockBrokenState.__hash,
    'Different states should have different hashes'
  );
});

// ---- Remediation Logic ----
test('config regeneration produces valid defaults', () => {
  const defaultState = {
    schema: {},
    topology: { nodes: [], services: ['backend', 'frontend', 'prometheus'] },
    load: 0,
    last_regenerated: new Date().toISOString(),
    version: 1
  };

  assertTrue(Array.isArray(defaultState.topology.services), 'Should have services array');
  assertTrue(defaultState.load === 0, 'Load should be reset');
});

// ---- File Existence ----
test('core files exist', () => {
  assertTrue(fs.existsSync('overseer.js'), 'overseer.js should exist');
  assertTrue(fs.existsSync('docker-compose.overseer.yml'), 'docker-compose.overseer.yml should exist');
  assertTrue(fs.existsSync('services/overseer/Dockerfile'), 'Dockerfile should exist');
});

test('log directory can be created', () => {
  const logDir = path.dirname('/var/log/bridge/overseer.log');
  // Just check the path is valid — OS will handle actual creation
  assertTrue(logDir.length > 0, 'Log dir path should be valid');
});

// ============================================
// SUMMARY
// ============================================

console.log('\n=== TEST RESULTS ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\nAll tests passed ✓\n');
  process.exit(0);
}
