/**
 * contracts.test.js
 * Agent-6A — Unit Testing
 *
 * Validates all 5 contract JSON files in shared/:
 *   - auth-api-spec.json
 *   - dashboard-manifest.json
 *   - database-schema.json
 *   - gateway-api-spec.json
 *   - test-spec.json
 *
 * Each contract must have required fields and must not form circular
 * dependencies with any other contract.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Load all contracts
// ---------------------------------------------------------------------------
const SHARED_DIR = path.join(__dirname, '..', 'shared');

const CONTRACT_FILES = [
  'auth-api-spec.json',
  'dashboard-manifest.json',
  'database-schema.json',
  'gateway-api-spec.json',
  'test-spec.json',
];

const REQUIRED_FIELDS = ['contract_id', 'status', 'title', 'depends_on', 'used_by'];

// Load each file; track load errors so individual tests can surface them clearly
const contracts = CONTRACT_FILES.map((filename) => {
  const filePath = path.join(SHARED_DIR, filename);
  try {
    const raw  = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    return { filename, filePath, data, error: null };
  } catch (err) {
    return { filename, filePath, data: null, error: err.message };
  }
});

// ---------------------------------------------------------------------------
// Helper: detect circular dependencies using DFS
// ---------------------------------------------------------------------------
function buildDependencyGraph(loadedContracts) {
  // Map contract_id → depends_on list
  const graph = {};
  for (const { data } of loadedContracts) {
    if (!data) continue;
    graph[data.contract_id] = Array.isArray(data.depends_on) ? data.depends_on : [];
  }
  return graph;
}

function hasCycle(graph) {
  const visited  = new Set();
  const recStack = new Set();

  function dfs(node) {
    if (!visited.has(node)) {
      visited.add(node);
      recStack.add(node);

      const neighbours = graph[node] || [];
      for (const neighbour of neighbours) {
        if (!visited.has(neighbour) && dfs(neighbour)) return true;
        if (recStack.has(neighbour)) return true;
      }
    }
    recStack.delete(node);
    return false;
  }

  for (const node of Object.keys(graph)) {
    if (dfs(node)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tests: each file loads successfully
// ---------------------------------------------------------------------------
describe('Contract files — load & parse', () => {
  test.each(CONTRACT_FILES)('%s exists and is valid JSON', (filename) => {
    const entry = contracts.find((c) => c.filename === filename);
    expect(entry.error).toBeNull();
    expect(entry.data).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: required fields present in every contract
// ---------------------------------------------------------------------------
describe('Contract files — required fields', () => {
  for (const { filename, data, error } of contracts) {
    describe(filename, () => {
      // Skip field checks when the file failed to load — already caught above
      if (error || !data) {
        test.skip('skipped — file failed to load', () => {});
        continue;
      }

      test.each(REQUIRED_FIELDS)('has field "%s"', (field) => {
        expect(data).toHaveProperty(field);
      });

      test('contract_id is a non-empty string', () => {
        expect(typeof data.contract_id).toBe('string');
        expect(data.contract_id.length).toBeGreaterThan(0);
      });

      test('status is a non-empty string', () => {
        expect(typeof data.status).toBe('string');
        expect(data.status.length).toBeGreaterThan(0);
      });

      test('title is a non-empty string', () => {
        expect(typeof data.title).toBe('string');
        expect(data.title.length).toBeGreaterThan(0);
      });

      test('depends_on is an array', () => {
        expect(Array.isArray(data.depends_on)).toBe(true);
      });

      test('used_by is an array or string', () => {
        const val = data.used_by;
        expect(typeof val === 'string' || Array.isArray(val)).toBe(true);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: contract_id matches filename (convention check)
// ---------------------------------------------------------------------------
describe('Contract files — contract_id convention', () => {
  for (const { filename, data, error } of contracts) {
    if (error || !data) continue;

    test(`${filename}: contract_id matches filename stem`, () => {
      const stem = filename.replace('.json', '');
      expect(data.contract_id).toBe(stem);
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: depends_on references resolve to known contract IDs
// ---------------------------------------------------------------------------
describe('Contract files — dependency references', () => {
  const knownIds = contracts
    .filter((c) => c.data)
    .map((c) => c.data.contract_id);

  for (const { filename, data, error } of contracts) {
    if (error || !data || !Array.isArray(data.depends_on)) continue;

    for (const dep of data.depends_on) {
      test(`${filename}: depends_on "${dep}" resolves to a known contract`, () => {
        expect(knownIds).toContain(dep);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Tests: no circular dependencies across all contracts
// ---------------------------------------------------------------------------
describe('Contract files — circular dependency check', () => {
  test('dependency graph has no cycles', () => {
    const validContracts = contracts.filter((c) => c.data);
    const graph = buildDependencyGraph(validContracts);
    expect(hasCycle(graph)).toBe(false);
  });
});
