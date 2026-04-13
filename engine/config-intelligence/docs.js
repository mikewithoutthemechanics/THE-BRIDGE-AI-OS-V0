// =============================================================================
// BRIDGE AI OS — Self-Documentation Generator
//
// Auto-generates human-readable reports from system state.
// Outputs:
//   - System state summary (what's active, what failed)
//   - Validation report (per-layer results per CIO)
//   - Lineage report (mutation history)
//   - Diff report (changes since last snapshot)
//   - Migration log (changes across snapshots)
//   - Compatibility notes (warnings, dead deps)
// =============================================================================
'use strict';

const registry = require('./registry');
const snapshot = require('./snapshot');
const lineage  = require('./lineage');

// ── System state summary ──────────────────────────────────────────────────────
function systemSummary(engineState) {
  const { activeCIOs = [], selected = {}, merged = {}, anomalyReport = null } = engineState;

  const lines = [
    '# Bridge AI OS — Config Intelligence System Report',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Active Configuration',
    `- Configs:  ${(selected.configs  || []).length}`,
    `- Vars:     ${(selected.vars     || []).length}`,
    `- Secrets:  ${(selected.secrets  || []).length}`,
    `- Superseded: ${(selected.superseded || []).length}`,
    '',
    '## Merged State Keys',
    `- Config keys:   ${Object.keys(merged.config   || {}).join(', ') || 'none'}`,
    `- Variable keys: ${Object.keys(merged.variables|| {}).join(', ') || 'none'}`,
    `- Secret keys:   ${Object.keys(merged.secrets  || {}).join(', ') || 'none'}`,
    '',
  ];

  if (anomalyReport?.anomalies?.length > 0) {
    lines.push('## ⚠ Anomalies Detected');
    for (const a of anomalyReport.anomalies) {
      lines.push(`- [${a.severity.toUpperCase()}] ${a.type}: ${a.message}`);
    }
    lines.push('');
  }

  const regStats = registry.stats();
  lines.push('## Registry');
  lines.push(`- Total events: ${regStats.total}`);
  lines.push(`- Chain valid:  ${regStats.chainValid}`);
  lines.push(`- Session:      ${regStats.sessionId}`);

  if (regStats.byType && Object.keys(regStats.byType).length > 0) {
    lines.push('- Event breakdown:');
    for (const [type, count] of Object.entries(regStats.byType).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      lines.push(`  - ${type}: ${count}`);
    }
  }

  return lines.join('\n');
}

// ── Validation report ─────────────────────────────────────────────────────────
function validationReport(validationResults) {
  const { passed = [], failed = [], warnings = [] } = validationResults;
  const lines = [
    '# Validation Report',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Passed: ${passed.length} | Failed: ${failed.length} | With Warnings: ${warnings.length}`,
    '',
  ];

  if (failed.length > 0) {
    lines.push('## Failed CIOs');
    for (const f of failed) {
      lines.push(`### ${f.namespace} (${f.type})`);
      lines.push(`Hash: ${f.cioHash}`);
      for (const e of f.errors) lines.push(`- ERROR: ${e}`);
      lines.push('');
    }
  }

  if (warnings.length > 0) {
    lines.push('## CIOs with Warnings');
    for (const w of warnings) {
      lines.push(`- ${w.cioId}: ${w.warnings.join('; ')}`);
    }
    lines.push('');
  }

  if (passed.length > 0) {
    lines.push('## Passed CIOs');
    for (const p of passed) {
      lines.push(`- ✓ ${p.namespace} (${p.type}) — ${p.layers.length} layers passed`);
    }
  }

  return lines.join('\n');
}

// ── Score report ──────────────────────────────────────────────────────────────
function scoreReport(scoredResults) {
  const lines = [
    '# Score Report',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| Namespace | Type | Score | Completeness | Validation | Compatibility | Freshness | Performance |',
    '|-----------|------|-------|:---:|:---:|:---:|:---:|:---:|',
  ];

  for (const r of scoredResults) {
    const d = r.dimensions;
    lines.push(`| ${r.namespace} | ${r.type} | **${r.score}/100** | ${d.completeness}/25 | ${d.validation}/25 | ${d.compatibility}/20 | ${d.freshness}/15 | ${d.performance}/15 |`);
  }

  return lines.join('\n');
}

// ── Diff report (between snapshots) ──────────────────────────────────────────
function diffReport(snapshotA, snapshotB) {
  if (!snapshotA || !snapshotB) return '# Diff Report\nInsufficient snapshots to compare.';

  const stateA = snapshotA.state || {};
  const stateB = snapshotB.state || {};

  const lines = [
    '# Config Diff Report',
    `From: ${new Date(snapshotA.savedAt).toISOString()}`,
    `To:   ${new Date(snapshotB.savedAt).toISOString()}`,
    '',
  ];

  for (const section of ['config', 'variables', 'secrets']) {
    const a = stateA[section] || {};
    const b = stateB[section] || {};
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);

    const sectionChanges = [];
    for (const k of allKeys) {
      if (!(k in a))                                  sectionChanges.push(`+ ${k} (added)`);
      else if (!(k in b))                             sectionChanges.push(`- ${k} (removed)`);
      else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) sectionChanges.push(`~ ${k} (changed)`);
    }

    if (sectionChanges.length > 0) {
      lines.push(`## ${section}`);
      for (const c of sectionChanges) lines.push(`  ${c}`);
      lines.push('');
    }
  }

  if (lines.length === 4) lines.push('No changes detected between snapshots.');

  return lines.join('\n');
}

// ── Export all docs as object ─────────────────────────────────────────────────
function generateAll(engineState, validationResults, scoredResults) {
  return {
    summary:    systemSummary(engineState),
    validation: validationReport(validationResults || { passed: [], failed: [], warnings: [] }),
    scores:     scoreReport(scoredResults || []),
    generatedAt: Date.now(),
  };
}

module.exports = { systemSummary, validationReport, scoreReport, diffReport, generateAll };
