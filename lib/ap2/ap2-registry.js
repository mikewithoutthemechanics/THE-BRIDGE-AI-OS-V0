/**
 * BRIDGE AI OS — External Agent Registry (AP2 Protocol)
 *
 * Manages registration, routing, and revenue tracking for external AI agents
 * that participate in the Bridge economy via the AP2 protocol.
 *
 * SQLite table: external_agents
 * Default commission: 15% on all external agent transactions
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ── DB path ─────────────────────────────────────────────────────────────────
const DB_PATH = process.env.AP2_REGISTRY_DB_PATH
  || path.join(__dirname, '..', '..', 'data', 'agent-ledger.db');

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ── Schema ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS external_agents (
    id                  TEXT PRIMARY KEY,
    agent_name          TEXT NOT NULL,
    agent_url           TEXT NOT NULL,
    service_catalog_json TEXT DEFAULT '[]',
    commission_rate     REAL NOT NULL DEFAULT 0.15,
    total_transactions  INTEGER NOT NULL DEFAULT 0,
    total_revenue       REAL NOT NULL DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'active',
    registered_at       TEXT NOT NULL DEFAULT (datetime('now')),
    last_active         TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_ext_agents_status ON external_agents(status);
  CREATE INDEX IF NOT EXISTS idx_ext_agents_name ON external_agents(agent_name);
`);

// ── Prepared statements ─────────────────────────────────────────────────────
const stmts = {
  insert: db.prepare(`
    INSERT INTO external_agents (id, agent_name, agent_url, service_catalog_json, commission_rate)
    VALUES (?, ?, ?, ?, ?)
  `),
  listByStatus: db.prepare(`
    SELECT * FROM external_agents WHERE status = ? ORDER BY total_revenue DESC
  `),
  listAll: db.prepare(`
    SELECT * FROM external_agents ORDER BY total_revenue DESC
  `),
  getById: db.prepare(`SELECT * FROM external_agents WHERE id = ?`),
  recordTx: db.prepare(`
    UPDATE external_agents
    SET total_transactions = total_transactions + 1,
        total_revenue = total_revenue + ?,
        last_active = datetime('now')
    WHERE id = ?
  `),
  updateStatus: db.prepare(`
    UPDATE external_agents SET status = ? WHERE id = ?
  `),
  stats: db.prepare(`
    SELECT
      COUNT(*) as total_agents,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_agents,
      SUM(total_transactions) as total_transactions,
      SUM(total_revenue) as total_revenue,
      AVG(commission_rate) as avg_commission
    FROM external_agents
  `),
};

// ── Functions ───────────────────────────────────────────────────────────────

/**
 * Register an external AP2 agent with its service catalog.
 * Default 15% commission rate.
 */
function registerExternalAgent(name, url, catalog, commissionRate = 0.15) {
  const id = 'ext_' + crypto.randomBytes(8).toString('hex');
  const catalogJson = typeof catalog === 'string' ? catalog : JSON.stringify(catalog || []);
  stmts.insert.run(id, name, url, catalogJson, commissionRate);
  console.log('[AP2] Registered external agent: ' + name + ' (' + id + ') at ' + url);
  return { id, agent_name: name, agent_url: url, commission_rate: commissionRate };
}

/**
 * List registered external agents, optionally filtered by status.
 */
function getExternalAgents(status) {
  const rows = status ? stmts.listByStatus.all(status) : stmts.listAll.all();
  return rows.map(r => ({
    ...r,
    service_catalog: JSON.parse(r.service_catalog_json || '[]'),
  }));
}

/**
 * Find the best external agent for a given task type.
 * Searches service catalogs and returns the highest-revenue active agent that offers the service.
 */
function routeToExternal(taskType) {
  const agents = stmts.listByStatus.all('active');
  const taskLower = (taskType || '').toLowerCase();

  let bestAgent = null;
  let bestRevenue = -1;

  for (const agent of agents) {
    let catalog = [];
    try { catalog = JSON.parse(agent.service_catalog_json || '[]'); } catch (e) { /* skip */ }

    const offers = Array.isArray(catalog)
      ? catalog.some(function(s) {
          return (s.type || s.name || s || '').toString().toLowerCase().indexOf(taskLower) >= 0;
        })
      : false;

    if (offers && agent.total_revenue > bestRevenue) {
      bestAgent = agent;
      bestRevenue = agent.total_revenue;
    }
  }

  if (!bestAgent) return null;
  return {
    ...bestAgent,
    service_catalog: JSON.parse(bestAgent.service_catalog_json || '[]'),
  };
}

/**
 * Record a transaction from an external agent, tracking revenue.
 */
function recordExternalTransaction(agentId, amount) {
  const agent = stmts.getById.get(agentId);
  if (!agent) throw new Error('External agent ' + agentId + ' not found');

  const commission = amount * agent.commission_rate;
  stmts.recordTx.run(commission, agentId);

  console.log('[AP2] Transaction recorded: agent=' + agentId + ' amount=' + amount + ' commission=' + commission.toFixed(2));
  return {
    agent_id: agentId,
    amount,
    commission,
    commission_rate: agent.commission_rate,
  };
}

/**
 * Aggregate stats on the external agent economy.
 */
function getExternalStats() {
  const row = stmts.stats.get();
  return {
    total_agents: row.total_agents || 0,
    active_agents: row.active_agents || 0,
    total_transactions: row.total_transactions || 0,
    total_revenue: row.total_revenue || 0,
    avg_commission: row.avg_commission || 0.15,
  };
}

module.exports = {
  registerExternalAgent,
  getExternalAgents,
  routeToExternal,
  recordExternalTransaction,
  getExternalStats,
};
