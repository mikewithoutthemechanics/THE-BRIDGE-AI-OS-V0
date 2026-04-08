/**
 * BRIDGE AI OS — Unified Agent Registry (SQLite-backed)
 *
 * Single source of truth for ALL agents in the system.
 * Replaces the 6 scattered hardcoded agent lists with one dynamic DB table.
 *
 * Every agent gets: unique id, unique name, role, layer, type, skills, status.
 * On first boot, seeds from the canonical roster. After that, all changes go through
 * this module's CRUD functions — no more editing static arrays.
 *
 * Usage:
 *   const registry = require('./lib/agent-registry');
 *   registry.getAll();
 *   registry.getById('prime-001');
 *   registry.getByName('Aurora');
 *   registry.register({ name: 'Spectra', role: 'osint_analyst', ... });
 *   registry.update('prime-001', { status: 'idle' });
 *   registry.search({ layer: 'prime', type: 'prime' });
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// ── DB ─────────────────────────────────────────────────────────────────────
const DB_PATH = process.env.REGISTRY_DB_PATH
  || path.join(__dirname, '..', 'data', 'agent-registry.db');

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ─────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    role        TEXT NOT NULL DEFAULT 'general',
    layer       TEXT NOT NULL DEFAULT 'L1',
    type        TEXT NOT NULL DEFAULT 'agent',
    source      TEXT,
    skills      TEXT NOT NULL DEFAULT '[]',
    status      TEXT NOT NULL DEFAULT 'active',
    config      TEXT NOT NULL DEFAULT '{}',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_agents_name   ON agents(name);
  CREATE INDEX IF NOT EXISTS idx_agents_role   ON agents(role);
  CREATE INDEX IF NOT EXISTS idx_agents_layer  ON agents(layer);
  CREATE INDEX IF NOT EXISTS idx_agents_type   ON agents(type);
  CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
`);

// ── Helpers ────────────────────────────────────────────────────────────────

function uid(prefix) {
  return (prefix || 'ag') + '_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
}

function toJSON(val) {
  if (typeof val === 'string') return val;
  return JSON.stringify(val || []);
}

function parseRow(row) {
  if (!row) return null;
  return {
    ...row,
    skills: JSON.parse(row.skills || '[]'),
    config: JSON.parse(row.config || '{}'),
  };
}

// ── CRUD ───────────────────────────────────────────────────────────────────

const stmts = {
  getAll:     db.prepare('SELECT * FROM agents ORDER BY layer, type, name'),
  getById:    db.prepare('SELECT * FROM agents WHERE id = ?'),
  getByName:  db.prepare('SELECT * FROM agents WHERE name = ? COLLATE NOCASE'),
  getByRole:  db.prepare('SELECT * FROM agents WHERE role = ?'),
  getByLayer: db.prepare('SELECT * FROM agents WHERE layer = ?'),
  getByType:  db.prepare('SELECT * FROM agents WHERE type = ?'),
  getActive:  db.prepare("SELECT * FROM agents WHERE status = 'active' ORDER BY layer, name"),
  count:      db.prepare('SELECT COUNT(*) as total FROM agents'),
  countByStatus: db.prepare('SELECT status, COUNT(*) as count FROM agents GROUP BY status'),
  countByLayer:  db.prepare('SELECT layer, COUNT(*) as count FROM agents GROUP BY layer'),
  countByType:   db.prepare('SELECT type, COUNT(*) as count FROM agents GROUP BY type'),
  search:     db.prepare("SELECT * FROM agents WHERE name LIKE ? OR role LIKE ? OR id LIKE ? ORDER BY name LIMIT ?"),

  insert: db.prepare(
    'INSERT OR IGNORE INTO agents (id, name, role, layer, type, source, skills, status, config) ' +
    'VALUES (@id, @name, @role, @layer, @type, @source, @skills, @status, @config)'
  ),

  update: db.prepare(
    'UPDATE agents SET ' +
    'name = COALESCE(@name, name), ' +
    'role = COALESCE(@role, role), ' +
    'layer = COALESCE(@layer, layer), ' +
    'type = COALESCE(@type, type), ' +
    'source = COALESCE(@source, source), ' +
    'skills = COALESCE(@skills, skills), ' +
    'status = COALESCE(@status, status), ' +
    'config = COALESCE(@config, config), ' +
    'updated_at = CURRENT_TIMESTAMP ' +
    'WHERE id = @id'
  ),

  remove: db.prepare('DELETE FROM agents WHERE id = ?'),
  exists: db.prepare('SELECT 1 FROM agents WHERE id = ? LIMIT 1'),
  nameExists: db.prepare('SELECT 1 FROM agents WHERE name = ? COLLATE NOCASE LIMIT 1'),
};

function getAll() {
  return stmts.getAll.all().map(parseRow);
}

function getById(id) {
  return parseRow(stmts.getById.get(id));
}

function getByName(name) {
  return parseRow(stmts.getByName.get(name));
}

function getActive() {
  return stmts.getActive.all().map(parseRow);
}

function search(query, limit) {
  var q = '%' + query + '%';
  return stmts.search.all(q, q, q, limit || 50).map(parseRow);
}

function getByFilter(filter) {
  filter = filter || {};
  var sql = 'SELECT * FROM agents WHERE 1=1';
  var params = [];
  if (filter.layer)  { sql += ' AND layer = ?';  params.push(filter.layer); }
  if (filter.type)   { sql += ' AND type = ?';   params.push(filter.type); }
  if (filter.role)   { sql += ' AND role = ?';    params.push(filter.role); }
  if (filter.status) { sql += ' AND status = ?';  params.push(filter.status); }
  sql += ' ORDER BY layer, name LIMIT ?';
  params.push(filter.limit || 100);
  return db.prepare(sql).all.apply(db.prepare(sql), params).map(parseRow);
}

function register(agent) {
  var id = agent.id || uid(agent.type || 'ag');
  var name = agent.name;
  if (!name) throw new Error('Agent name is required');

  if (stmts.exists.get(id)) throw new Error('Agent ID already exists: ' + id);
  if (stmts.nameExists.get(name)) throw new Error('Agent name already taken: ' + name);

  var row = {
    id:     id,
    name:   name,
    role:   agent.role || 'general',
    layer:  agent.layer || 'L1',
    type:   agent.type || 'agent',
    source: agent.source || null,
    skills: toJSON(agent.skills || []),
    status: agent.status || 'active',
    config: toJSON(agent.config || {}),
  };
  stmts.insert.run(row);
  return parseRow(stmts.getById.get(id));
}

function update(id, changes) {
  var row = {
    id:     id,
    name:   changes.name || null,
    role:   changes.role || null,
    layer:  changes.layer || null,
    type:   changes.type || null,
    source: changes.source || null,
    skills: changes.skills ? toJSON(changes.skills) : null,
    status: changes.status || null,
    config: changes.config ? toJSON(changes.config) : null,
  };
  var result = stmts.update.run(row);
  if (result.changes === 0) throw new Error('Agent not found: ' + id);
  return parseRow(stmts.getById.get(id));
}

function remove(id) {
  var agent = getById(id);
  if (!agent) throw new Error('Agent not found: ' + id);
  stmts.remove.run(id);
  return agent;
}

function stats() {
  return {
    total: stmts.count.get().total,
    by_status: Object.fromEntries(stmts.countByStatus.all().map(function(r) { return [r.status, r.count]; })),
    by_layer:  Object.fromEntries(stmts.countByLayer.all().map(function(r) { return [r.layer, r.count]; })),
    by_type:   Object.fromEntries(stmts.countByType.all().map(function(r) { return [r.type, r.count]; })),
  };
}

// ── CANONICAL SEED (all agents with unique names) ──────────────────────────
// Runs on first boot only. After that, manage agents via CRUD.

var SEED_AGENTS = [
  // === PRIME AGENTS (C-Suite) ===
  { id: 'prime-001',       name: 'Prime',      role: 'master_orchestrator',         layer: 'core',  type: 'prime',   source: 'brain.js',           skills: ['reason', 'plan', 'execute', 'trade', 'teach', 'communicate', 'deploy', 'heal'] },
  { id: 'prime-aurora',    name: 'Aurora',      role: 'revenue_orchestrator',        layer: 'prime', type: 'prime',   source: 'lib/prime-agents.js', skills: ['revenue_optimization', 'pricing_strategy', 'conversion_analysis'] },
  { id: 'prime-atlas',     name: 'Atlas',       role: 'infrastructure_orchestrator', layer: 'prime', type: 'prime',   source: 'lib/prime-agents.js', skills: ['system_architecture', 'performance_optimization', 'security_audit'] },
  { id: 'prime-vega',      name: 'Vega',        role: 'intelligence_orchestrator',   layer: 'prime', type: 'prime',   source: 'lib/prime-agents.js', skills: ['market_research', 'competitive_analysis', 'trend_prediction'] },
  { id: 'prime-omega',     name: 'Omega',       role: 'operations_orchestrator',     layer: 'prime', type: 'prime',   source: 'lib/prime-agents.js', skills: ['workflow_optimization', 'resource_allocation', 'quality_assurance'] },
  { id: 'prime-halo',      name: 'Halo',        role: 'experience_orchestrator',     layer: 'prime', type: 'prime',   source: 'lib/prime-agents.js', skills: ['ux_design', 'user_research', 'onboarding_optimization'] },
  { id: 'prime-nexus',     name: 'Nexus',       role: 'commerce_orchestrator',       layer: 'prime', type: 'prime',   source: 'lib/prime-agents.js', skills: ['ap2_protocol', 'merchant_relations', 'affiliate_management'] },
  { id: 'prime-sentinel',  name: 'Sentinel',    role: 'security_orchestrator',       layer: 'prime', type: 'prime',   source: 'lib/prime-agents.js', skills: ['threat_detection', 'access_control', 'incident_response'] },

  // === DIGITAL TWIN ===
  { id: 'twin-empe-001',   name: 'Bridge Twin', role: 'digital_twin',               layer: 'core',  type: 'twin',    source: 'brain.js',           skills: ['reasoning', 'coding', 'trading', 'communication', 'teaching'] },

  // === L1 ORCHESTRATORS ===
  { id: 'agent-1-gateway',     name: 'Gatecrasher',  role: 'gateway_coordinator',    layer: 'L1', type: 'orchestrator', source: 'gateway.js',     skills: ['routing', 'load_balancing', 'health_monitoring'] },
  { id: 'agent-2a-dashboard',  name: 'Dashwell',     role: 'ui_coordinator',         layer: 'L1', type: 'orchestrator', source: 'system.js',      skills: ['ui_rendering', 'data_aggregation', 'event_streaming'] },
  { id: 'agent-3a-data',       name: 'Dataforge',    role: 'data_pipeline',          layer: 'L1', type: 'orchestrator', source: 'brain.js',       skills: ['etl', 'indexing', 'caching', 'rag'] },
  { id: 'agent-4a-auth',       name: 'Keymaster',    role: 'security',               layer: 'L1', type: 'orchestrator', source: 'auth.js',        skills: ['jwt', 'keyforge', 'mfa', 'oauth'] },
  { id: 'agent-5a-testing',    name: 'Ironproof',    role: 'qa',                     layer: 'L1', type: 'orchestrator', source: 'test-routes.js', skills: ['integration_testing', 'load_testing', 'security_scanning'] },
  { id: 'agent-6a-governance', name: 'Civic',        role: 'compliance',             layer: 'L1', type: 'orchestrator', source: 'brain.js',       skills: ['policy_enforcement', 'audit', 'sdg_tracking'] },

  // === L2 ORCHESTRATORS ===
  { id: 'agent-l2-verifier',   name: 'Truthsayer',   role: 'verification',           layer: 'L2', type: 'orchestrator', source: 'brain.js', skills: ['contract_verification', 'conflict_detection', 'consensus'] },
  { id: 'agent-l2-streamer',   name: 'Rivercurrent', role: 'data_streaming',         layer: 'L2', type: 'orchestrator', source: 'brain.js', skills: ['event_streaming', 'replication', 'sync'] },

  // === L3 ORCHESTRATOR ===
  { id: 'agent-l3-minimax',    name: 'Chessmaster',  role: 'optimization',           layer: 'L3', type: 'orchestrator', source: 'brain.js', skills: ['minimax', 'game_theory', 'resource_optimization'] },

  // === SVG ENGINE / SKILL AGENTS ===
  { id: 'agent-svg-decision',  name: 'Arbiter',      role: 'decision_making',        layer: 'brain', type: 'skill', source: 'bridge.decision.skill.js', skills: ['ethical_filter', 'confidence_scoring', 'action_routing'] },
  { id: 'agent-svg-economy',   name: 'Treasurer',    role: 'economy',                layer: 'brain', type: 'skill', source: 'bridge.economy.skill.js', skills: ['circuit_breaker', 'exposure_tracking', 'treasury_flow'] },
  { id: 'agent-svg-speech',    name: 'Voicecraft',   role: 'communication',          layer: 'brain', type: 'skill', source: 'bridge.speech.skill.js',  skills: ['tts', 'stt', 'lip_sync', 'emotion_voice'] },
  { id: 'agent-svg-swarm',     name: 'Hivemind',     role: 'monitoring',             layer: 'brain', type: 'skill', source: 'bridge.swarm.skill.js',   skills: ['latency_monitor', 'utilization_tracking', 'fault_detection'] },
  { id: 'agent-svg-treasury',  name: 'Vaultkeeper',  role: 'finance',                layer: 'brain', type: 'skill', source: 'bridge.treasury.skill.js', skills: ['revenue_tracking', 'ubi_distribution', 'cost_optimization'] },
  { id: 'agent-svg-twins',     name: 'Twinmaker',    role: 'twin_management',        layer: 'brain', type: 'skill', source: 'bridge.twins.skill.js',   skills: ['evolution', 'competition', 'teaching', 'leaderboard'] },
  { id: 'agent-svg-youtube',   name: 'Scholar',      role: 'learning',               layer: 'brain', type: 'skill', source: 'bridge.youtube.skill.js', skills: ['video_discovery', 'transcript_extraction', 'skill_learning'] },
  { id: 'agent-svg-flow',      name: 'Conductor',    role: 'workflow',               layer: 'brain', type: 'skill', source: 'flow.basic.skill.js',     skills: ['workflow_execution', 'step_routing', 'error_handling'] },

  // === BUSINESS SUITE AGENTS ===
  { id: 'agent-biz-sales',     name: 'Dealmaker',    role: 'sales',                  layer: 'business', type: 'business', source: 'brain-business.js', skills: ['lead_gen', 'outreach', 'deal_closing', 'crm'] },
  { id: 'agent-biz-support',   name: 'Helphand',     role: 'support',                layer: 'business', type: 'business', source: 'brain-business.js', skills: ['ticket_handling', 'knowledge_base', 'escalation'] },
  { id: 'agent-biz-research',  name: 'Deepdive',     role: 'research',               layer: 'business', type: 'business', source: 'brain-business.js', skills: ['market_analysis', 'competitor_intel', 'trend_detection'] },
  { id: 'agent-biz-marketing', name: 'Brandsmith',   role: 'marketing',              layer: 'business', type: 'business', source: 'brain-business.js', skills: ['campaign_management', 'seo', 'social_media', 'email'] },
  { id: 'agent-biz-legal',     name: 'Lawkeeper',    role: 'legal',                  layer: 'business', type: 'business', source: 'brain-business.js', skills: ['contract_review', 'compliance', 'popia', 'gdpr'] },
  { id: 'agent-biz-finance',   name: 'Ledgerman',    role: 'finance',                layer: 'business', type: 'business', source: 'brain-business.js', skills: ['invoicing', 'debt_collection', 'payroll', 'reporting'] },
  { id: 'agent-biz-dev',       name: 'Codewright',   role: 'engineering',            layer: 'business', type: 'business', source: 'brain-business.js', skills: ['coding', 'deployment', 'testing', 'ci_cd'] },
  { id: 'agent-biz-trading',   name: 'Marketweaver', role: 'trading',                layer: 'business', type: 'business', source: 'brain-business.js', skills: ['momentum', 'arbitrage', 'sentiment', 'risk_management'] },

  // === BOSSBOTS (Trading Twins) ===
  { id: 'bossbot-alpha',       name: 'Bullrun',      role: 'trading',                layer: 'bossbots', type: 'bossbot', source: 'twins/services.py', skills: ['momentum_trading', 'btc_usd'] },
  { id: 'bossbot-beta',        name: 'Flipside',     role: 'trading',                layer: 'bossbots', type: 'bossbot', source: 'twins/services.py', skills: ['cross_exchange_arb', 'eth_btc'] },
  { id: 'bossbot-gamma',       name: 'Moodring',     role: 'trading',                layer: 'bossbots', type: 'bossbot', source: 'twins/services.py', skills: ['sentiment_analysis', 'sol_usd'] },
  { id: 'bossbot-delta',       name: 'Snapback',     role: 'trading',                layer: 'bossbots', type: 'bossbot', source: 'twins/services.py', skills: ['mean_reversion', 'eth_usd'] },

  // === BAN NODE AGENTS ===
  { id: 'ban-ryan',            name: 'Ryan',         role: 'execution',              layer: 'ban', type: 'ban_node', source: 'BAN/nodes/registry.py', skills: ['task_execution', 'high_trust'] },
  { id: 'ban-mike',            name: 'Mike',         role: 'execution',              layer: 'ban', type: 'ban_node', source: 'BAN/nodes/registry.py', skills: ['task_execution', 'medium_trust'] },
  { id: 'ban-marvin',          name: 'Marvin',       role: 'execution',              layer: 'ban', type: 'ban_node', source: 'BAN/nodes/registry.py', skills: ['task_execution', 'learning'] },

  // === LLM-POWERED AGENTS (from lib/agents.js AGENT_DEFS) ===
  { id: 'llm-quotegen',        name: 'Quotient',     role: 'sales_quotes',           layer: 'llm', type: 'llm_agent', source: 'lib/agents.js', skills: ['quote_generation', 'roi_calculation', 'sales_copy'] },
  { id: 'llm-finance',         name: 'Fiscal',       role: 'financial_analysis',     layer: 'llm', type: 'llm_agent', source: 'lib/agents.js', skills: ['forecasting', 'budgeting', 'projections'] },
  { id: 'llm-growth',          name: 'Catalyst',     role: 'growth_hacking',         layer: 'llm', type: 'llm_agent', source: 'lib/agents.js', skills: ['growth_tactics', 'b2b_strategy', 'sa_market'] },
  { id: 'llm-intelligence',    name: 'Spyglass',     role: 'competitive_intel',      layer: 'llm', type: 'llm_agent', source: 'lib/agents.js', skills: ['market_signals', 'competitor_gaps', 'opportunity_detection'] },
  { id: 'llm-nurture',         name: 'Warmth',       role: 'email_nurture',          layer: 'llm', type: 'llm_agent', source: 'lib/agents.js', skills: ['email_sequences', 'personalization', 'nurture_strategy'] },
  { id: 'llm-closer',          name: 'Lockjaw',      role: 'sales_closing',          layer: 'llm', type: 'llm_agent', source: 'lib/agents.js', skills: ['objection_handling', 'closing_strategy', 'deal_acceleration'] },
  { id: 'llm-campaign',        name: 'Adcraft',      role: 'ad_campaigns',           layer: 'llm', type: 'llm_agent', source: 'lib/agents.js', skills: ['paid_ads', 'budget_allocation', 'targeting', 'kpi_tracking'] },
  { id: 'llm-creative',        name: 'Muse',         role: 'creative_copy',          layer: 'llm', type: 'llm_agent', source: 'lib/agents.js', skills: ['marketing_copy', 'creative_briefs', 'brand_voice'] },
  { id: 'llm-support',         name: 'Concierge',    role: 'tech_support',           layer: 'llm', type: 'llm_agent', source: 'lib/agents.js', skills: ['ticket_triage', 'troubleshooting', 'pattern_detection'] },
  { id: 'llm-supply',          name: 'Costcutter',   role: 'cost_optimization',      layer: 'llm', type: 'llm_agent', source: 'lib/agents.js', skills: ['vendor_optimization', 'api_routing', 'infra_costs'] },
  { id: 'llm-infra',           name: 'Watchdog',     role: 'sre',                    layer: 'llm', type: 'llm_agent', source: 'lib/agents.js', skills: ['health_scoring', 'anomaly_detection', 'ops_actions'] },
];

// ── Seed on first boot ─────────────────────────────────────────────────────

var seedMany = db.transaction(function(agents) {
  for (var i = 0; i < agents.length; i++) {
    var a = agents[i];
    stmts.insert.run({
      id:     a.id,
      name:   a.name,
      role:   a.role,
      layer:  a.layer,
      type:   a.type,
      source: a.source || null,
      skills: toJSON(a.skills),
      status: a.status || 'active',
      config: toJSON(a.config || {}),
    });
  }
});

// Only seed if table is empty (first boot)
if (stmts.count.get().total === 0) {
  seedMany(SEED_AGENTS);
  console.log('[agent-registry] Seeded ' + SEED_AGENTS.length + ' agents into DB');
}

// ── LLM Agent Name Map (backward compat with AGENT_DEFS) ──────────────────
var LLM_NAME_MAP = {
  'QuoteGen AI':    'llm-quotegen',
  'Finance AI':     'llm-finance',
  'Growth Hunter':  'llm-growth',
  'Intelligence AI':'llm-intelligence',
  'Nurture AI':     'llm-nurture',
  'Closer AI':      'llm-closer',
  'Campaign AI':    'llm-campaign',
  'Creative AI':    'llm-creative',
  'Support AI':     'llm-support',
  'Supply AI':      'llm-supply',
  'Infra AI':       'llm-infra',
};

function resolveAgentId(nameOrId) {
  if (stmts.exists.get(nameOrId)) return nameOrId;
  if (LLM_NAME_MAP[nameOrId]) return LLM_NAME_MAP[nameOrId];
  var byName = stmts.getByName.get(nameOrId);
  if (byName) return byName.id;
  return null;
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  getAll:         getAll,
  getById:        getById,
  getByName:      getByName,
  getActive:      getActive,
  getByFilter:    getByFilter,
  search:         search,
  register:       register,
  update:         update,
  remove:         remove,
  stats:          stats,
  resolveAgentId: resolveAgentId,
  LLM_NAME_MAP:   LLM_NAME_MAP,
  SEED_AGENTS:    SEED_AGENTS,
  db:             db,
};
