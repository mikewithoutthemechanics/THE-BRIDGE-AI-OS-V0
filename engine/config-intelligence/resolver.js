// =============================================================================
// BRIDGE AI OS — Deterministic Conflict Resolver
//
// When multiple CIOs share a namespace, exactly one must win.
// Resolution is fully deterministic: same input → same winner, always.
//
// Resolution order:
//   1. Highest priority (config.priority field)
//   2. Highest intelligence score
//   3. Most recent modification timestamp
//   4. Lexicographically smallest hash (final deterministic tiebreaker)
//
// No randomness. No environment-dependent behavior.
// =============================================================================
'use strict';

const registry = require('./registry');

// ── Select winner among CIOs with same namespace ──────────────────────────────
function resolveNamespaceConflict(cioGroup, scoreMap = new Map()) {
  if (cioGroup.length === 0) return null;
  if (cioGroup.length === 1) return cioGroup[0];

  // Filter to valid-only first
  const validCIOs = cioGroup.filter(c => c.status !== 'invalid' && c.status !== 'quarantined');
  const candidates = validCIOs.length > 0 ? validCIOs : cioGroup; // fallback to all if none valid

  const winner = [...candidates].sort((a, b) => {
    // 1. Priority (higher wins) — only for config type
    const aPriority = a.payload?.priority ?? 50;
    const bPriority = b.payload?.priority ?? 50;
    if (aPriority !== bPriority) return bPriority - aPriority;

    // 2. Intelligence score (higher wins)
    const aScore = scoreMap.get(a.hash) ?? 0;
    const bScore = scoreMap.get(b.hash) ?? 0;
    if (aScore !== bScore) return bScore - aScore;

    // 3. Recency (newer wins)
    const aTs = a.createdAt || 0;
    const bTs = b.createdAt || 0;
    if (aTs !== bTs) return bTs - aTs;

    // 4. Deterministic tiebreaker: smaller hash wins (lexicographic)
    return a.hash < b.hash ? -1 : 1;
  })[0];

  const losers = candidates.filter(c => c.hash !== winner.hash);

  registry.emit('CONFLICT_RESOLVED', {
    namespace:  winner.namespace,
    winnerId:   winner.id,
    winnerHash: winner.hash,
    loserCount: losers.length,
    loserIds:   losers.map(c => c.id),
    reason:     buildResolutionReason(winner, candidates, scoreMap),
  }, winner.hash);

  return { winner, losers };
}

function buildResolutionReason(winner, candidates, scoreMap) {
  if (candidates.length === 1) return 'sole-candidate';

  const topPriority = Math.max(...candidates.map(c => c.payload?.priority ?? 50));
  if ((winner.payload?.priority ?? 50) === topPriority && topPriority !== 50) return 'highest-priority';

  const topScore = Math.max(...candidates.map(c => scoreMap.get(c.hash) ?? 0));
  if ((scoreMap.get(winner.hash) ?? 0) === topScore && topScore > 0) return 'highest-score';

  const mostRecent = Math.max(...candidates.map(c => c.createdAt || 0));
  if (winner.createdAt === mostRecent) return 'most-recent';

  return 'hash-tiebreaker';
}

// ── Group CIOs by namespace ───────────────────────────────────────────────────
function groupByNamespace(cioList) {
  const groups = new Map();
  for (const cio of cioList) {
    if (!groups.has(cio.namespace)) groups.set(cio.namespace, []);
    groups.get(cio.namespace).push(cio);
  }
  return groups;
}

// ── Resolve all conflicts in a CIO set ───────────────────────────────────────
function resolveAll(cioSets, scoredResults = []) {
  const scoreMap = new Map(scoredResults.map(r => [r.cioHash, r.score]));

  const selected = { configs: [], vars: [], secrets: [], superseded: [] };

  for (const [type, list] of [['configs', cioSets.configs || []], ['vars', cioSets.vars || []], ['secrets', cioSets.secrets || []]]) {
    const groups = groupByNamespace(list);

    for (const [ns, group] of groups) {
      if (group.length === 1) {
        selected[type].push(group[0]);
      } else {
        const { winner, losers } = resolveNamespaceConflict(group, scoreMap);
        selected[type].push(winner);
        selected.superseded.push(...losers);
      }
    }
  }

  registry.emit('RESOLUTION_COMPLETE', {
    configs:    selected.configs.length,
    vars:       selected.vars.length,
    secrets:    selected.secrets.length,
    superseded: selected.superseded.length,
  });

  return selected;
}

// ── Merge selected CIOs into a single flat state object ───────────────────────
function mergeToState(selected) {
  const state = {
    config:    {},
    variables: {},
    secrets:   {},
    meta: {
      builtAt:      Date.now(),
      configCount:  selected.configs.length,
      varCount:     selected.vars.length,
      secretCount:  selected.secrets.length,
      namespaces:   [],
    },
  };

  for (const cio of selected.configs) {
    Object.assign(state.config, cio.payload.payload || {});
    state.meta.namespaces.push(cio.namespace);
  }

  for (const cio of selected.vars) {
    for (const [k, v] of Object.entries(cio.payload.variables || {})) {
      state.variables[k] = v.default !== null ? v.default : (process.env[k] || null);
    }
  }

  for (const cio of selected.secrets) {
    for (const [k, v] of Object.entries(cio.payload.secrets || {})) {
      // Only expose key existence + rotation policy — never raw values in merged state
      state.secrets[k] = { encrypted: !!v.encrypted, rotation_policy: v.rotation_policy };
    }
  }

  return state;
}

module.exports = { resolveNamespaceConflict, resolveAll, mergeToState, groupByNamespace };
