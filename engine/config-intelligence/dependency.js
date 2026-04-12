// =============================================================================
// BRIDGE AI OS — Dependency Graph Builder
//
// Maps relationships between configs, vars, and secrets.
// Used for:
//   - Impact analysis ("if I change X, what breaks?")
//   - Safe change ordering (activate vars before configs that depend on them)
//   - Dead dependency detection (config references var that no longer exists)
// =============================================================================
'use strict';

const registry = require('./registry');

// ── Extract declared dependencies from a CIO ─────────────────────────────────
function extractDependencies(cio) {
  const deps = [];

  if (cio.type === 'config') {
    // Config can declare required_vars and required_secrets
    for (const ns of (cio.payload.requires_vars || [])) {
      deps.push({ from: cio.namespace, to: ns, type: 'config-requires-var' });
    }
    for (const ns of (cio.payload.requires_secrets || [])) {
      deps.push({ from: cio.namespace, to: ns, type: 'config-requires-secret' });
    }
    // Scan payload values for ${VAR_NAME} interpolation patterns
    for (const v of Object.values(cio.payload.payload || {})) {
      if (typeof v === 'string') {
        const matches = v.match(/\$\{([A-Z_][A-Z0-9_]*)\}/g) || [];
        for (const m of matches) {
          const varName = m.slice(2, -1);
          deps.push({ from: cio.namespace, to: `env.${varName}`, type: 'config-interpolates-var' });
        }
      }
    }
  }

  if (cio.type === 'var') {
    // Var defaults can reference other vars
    for (const [k, v] of Object.entries(cio.payload.variables || {})) {
      if (typeof v.default === 'string' && v.default.startsWith('${')) {
        const ref = v.default.slice(2, -1);
        deps.push({ from: cio.namespace, to: `env.${ref}`, type: 'var-references-env' });
      }
    }
  }

  return deps;
}

// ── Build full dependency graph ───────────────────────────────────────────────
function buildGraph(cioSets) {
  const allCIOs = [
    ...(cioSets.configs || []),
    ...(cioSets.vars    || []),
    ...(cioSets.secrets || []),
  ];

  const nodes = allCIOs.map(cio => ({
    id:        cio.id,
    namespace: cio.namespace,
    type:      cio.type,
    hash:      cio.hash,
    status:    cio.status,
  }));

  const edges = [];
  for (const cio of allCIOs) {
    edges.push(...extractDependencies(cio));
  }

  // Detect dead edges (dependency target namespace doesn't exist)
  const nodeNamespaces = new Set(nodes.map(n => n.namespace));
  const deadEdges = edges.filter(e => {
    if (e.to.startsWith('env.')) return false; // env vars are external
    return !nodeNamespaces.has(e.to);
  });

  if (deadEdges.length > 0) {
    registry.emit('DEAD_DEPENDENCIES', { count: deadEdges.length, edges: deadEdges });
  }

  return { nodes, edges, deadEdges };
}

// ── Topological sort — determines safe activation order ──────────────────────
function topologicalSort(graph) {
  const { nodes, edges } = graph;
  const inDegree = new Map(nodes.map(n => [n.namespace, 0]));
  const adj      = new Map(nodes.map(n => [n.namespace, []]));

  for (const edge of edges) {
    if (adj.has(edge.to)) {
      adj.get(edge.to).push(edge.from); // edge.from depends on edge.to → activate to first
      inDegree.set(edge.from, (inDegree.get(edge.from) || 0) + 1);
    }
  }

  const queue  = [...inDegree.entries()].filter(([, d]) => d === 0).map(([ns]) => ns);
  const sorted = [];

  while (queue.length > 0) {
    const ns = queue.shift();
    sorted.push(ns);
    for (const dependent of (adj.get(ns) || [])) {
      const deg = inDegree.get(dependent) - 1;
      inDegree.set(dependent, deg);
      if (deg === 0) queue.push(dependent);
    }
  }

  // Detect cycles
  if (sorted.length !== nodes.length) {
    const inCycle = nodes.map(n => n.namespace).filter(ns => !sorted.includes(ns));
    registry.emit('DEPENDENCY_CYCLE', { namespaces: inCycle });
    return { sorted, hasCycle: true, inCycle };
  }

  return { sorted, hasCycle: false, inCycle: [] };
}

// ── Impact analysis: what depends on a given namespace ───────────────────────
function impactOf(namespace, graph) {
  const dependents = graph.edges
    .filter(e => e.to === namespace)
    .map(e => e.from);
  return [...new Set(dependents)];
}

module.exports = { buildGraph, topologicalSort, impactOf, extractDependencies };
