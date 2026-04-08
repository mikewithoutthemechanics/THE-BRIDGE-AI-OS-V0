/**
 * BRIDGE AI OS — Bridge Commerce Index (BCI)
 *
 * Composite health score (0-100) for the Bridge economy:
 *   - Transaction volume    (25% weight)
 *   - Agent utilization     (20% weight)
 *   - Conversion rate       (20% weight)
 *   - Revenue growth rate   (15% weight)
 *   - Token velocity        (10% weight)
 *   - External agent participation (10% weight)
 *
 * Stored in SQLite: commerce_index (id, score, components_json, ts)
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// ── DB path ─────────────────────────────────────────────────────────────────
const DB_PATH = process.env.COMMERCE_INDEX_DB_PATH
  || path.join(__dirname, '..', 'data', 'agent-ledger.db');

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ── Schema ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS commerce_index (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    score           REAL NOT NULL,
    components_json TEXT NOT NULL DEFAULT '{}',
    ts              TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_commerce_ts ON commerce_index(ts);
`);

const stmts = {
  insert: db.prepare('INSERT INTO commerce_index (score, components_json) VALUES (?, ?)'),
  recent: db.prepare('SELECT * FROM commerce_index ORDER BY ts DESC LIMIT ?'),
  history: db.prepare("SELECT * FROM commerce_index WHERE ts >= datetime('now', ?) ORDER BY ts ASC"),
  latest: db.prepare('SELECT * FROM commerce_index ORDER BY ts DESC LIMIT 1'),
};

// ── External data hooks ─────────────────────────────────────────────────────
let _getTransactionVolume = function() { return 0; };
let _getAgentUtilization = function() { return 0; };
let _getConversionRate = function() { return 0; };
let _getRevenueGrowthRate = function() { return 0; };
let _getTokenVelocity = function() { return 0; };
let _getExternalAgentCount = function() { return 0; };

/**
 * Inject live data sources.
 */
function setDataSources(sources) {
  sources = sources || {};
  if (sources.getTransactionVolume) _getTransactionVolume = sources.getTransactionVolume;
  if (sources.getAgentUtilization) _getAgentUtilization = sources.getAgentUtilization;
  if (sources.getConversionRate) _getConversionRate = sources.getConversionRate;
  if (sources.getRevenueGrowthRate) _getRevenueGrowthRate = sources.getRevenueGrowthRate;
  if (sources.getTokenVelocity) _getTokenVelocity = sources.getTokenVelocity;
  if (sources.getExternalAgentCount) _getExternalAgentCount = sources.getExternalAgentCount;
}

/**
 * Normalize a raw value to a 0-100 score given expected min/max.
 */
function normalize(value, min, max) {
  if (max <= min) return 50;
  var clamped = Math.max(min, Math.min(max, value));
  return ((clamped - min) / (max - min)) * 100;
}

/**
 * Calculate the current Bridge Commerce Index.
 */
function calculateBCI() {
  var txVolume, agentUtil, convRate, revenueGrowth, tokenVelocity, extAgentCount;

  try { txVolume = _getTransactionVolume(); } catch (e) { txVolume = 0; }
  try { agentUtil = _getAgentUtilization(); } catch (e) { agentUtil = 0; }
  try { convRate = _getConversionRate(); } catch (e) { convRate = 0; }
  try { revenueGrowth = _getRevenueGrowthRate(); } catch (e) { revenueGrowth = 0; }
  try { tokenVelocity = _getTokenVelocity(); } catch (e) { tokenVelocity = 0; }
  try { extAgentCount = _getExternalAgentCount(); } catch (e) { extAgentCount = 0; }

  // Normalize each component to 0-100
  var components = {
    transaction_volume: {
      raw: txVolume,
      score: normalize(txVolume, 0, 200),
      weight: 0.25,
    },
    agent_utilization: {
      raw: agentUtil,
      score: Math.min(100, Math.max(0, agentUtil)),
      weight: 0.20,
    },
    conversion_rate: {
      raw: convRate,
      score: Math.min(100, Math.max(0, convRate)),
      weight: 0.20,
    },
    revenue_growth: {
      raw: revenueGrowth,
      score: normalize(revenueGrowth, -50, 100),
      weight: 0.15,
    },
    token_velocity: {
      raw: tokenVelocity,
      score: normalize(tokenVelocity, 0, 10000),
      weight: 0.10,
    },
    external_agents: {
      raw: extAgentCount,
      score: normalize(extAgentCount, 0, 50),
      weight: 0.10,
    },
  };

  // Weighted sum
  var score = 0;
  var keys = Object.keys(components);
  for (var i = 0; i < keys.length; i++) {
    var comp = components[keys[i]];
    score += comp.score * comp.weight;
  }
  score = Math.round(score * 100) / 100;

  // Persist
  var componentsJson = JSON.stringify(components);
  stmts.insert.run(score, componentsJson);

  return {
    score: score,
    components: components,
    ts: new Date().toISOString(),
  };
}

/**
 * Get BCI history for the last N days.
 */
function getBCIHistory(days) {
  days = days || 7;
  var modifier = '-' + days + ' days';
  var rows = stmts.history.all(modifier);
  return rows.map(function(r) {
    return {
      id: r.id,
      score: r.score,
      components: JSON.parse(r.components_json || '{}'),
      ts: r.ts,
    };
  });
}

/**
 * Get the latest BCI score without recalculating.
 */
function getLatestBCI() {
  var row = stmts.latest.get();
  if (!row) return null;
  return {
    id: row.id,
    score: row.score,
    components: JSON.parse(row.components_json || '{}'),
    ts: row.ts,
  };
}

module.exports = {
  calculateBCI: calculateBCI,
  getBCIHistory: getBCIHistory,
  getLatestBCI: getLatestBCI,
  setDataSources: setDataSources,
};
