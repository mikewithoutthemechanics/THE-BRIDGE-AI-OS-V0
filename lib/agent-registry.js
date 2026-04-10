/**
 * BRIDGE AI OS — Unified Agent Registry (Supabase-backed)
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
 *   await registry.getAll();
 *   await registry.getById('prime-001');
 *   await registry.getByName('Aurora');
 *   await registry.register({ name: 'Spectra', role: 'osint_analyst', ... });
 *   await registry.update('prime-001', { status: 'idle' });
 *   await registry.search('aurora');
 */

'use strict';

const crypto = require('crypto');
const { supabase, isConfigured } = require('./supabase');

if (!isConfigured) {
  console.warn('[agent-registry] Supabase not configured — registry will use in-memory fallback');
}

// ── In-memory fallback when Supabase unavailable ──────────────────────────
var memAgents = [];
var memSeeded = false;

function getSupabase() {
  if (supabase) return supabase;
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function uid(prefix) {
  return (prefix || 'ag') + '_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
}

function parseRow(row) {
  if (!row) return null;
  return {
    ...row,
    // skills and config are jsonb in Supabase — already parsed as objects/arrays
    skills: Array.isArray(row.skills) ? row.skills : (typeof row.skills === 'string' ? JSON.parse(row.skills || '[]') : (row.skills || [])),
    config: (row.config && typeof row.config === 'object') ? row.config : (typeof row.config === 'string' ? JSON.parse(row.config || '{}') : (row.config || {})),
  };
}

// ── CRUD ───────────────────────────────────────────────────────────────────

async function getAll() {
  var db = getSupabase();
  if (!db) { seedMemory(); return memAgents.map(parseRow); }

  const { data, error } = await db
    .from('agents')
    .select('*')
    .order('layer')
    .order('type')
    .order('name');

  if (error) throw new Error('getAll failed: ' + error.message);
  return (data || []).map(parseRow);
}

async function getById(id) {
  var db = getSupabase();
  if (!db) { seedMemory(); var found = memAgents.find(function(a){return a.id===id}); return parseRow(found || null); }
  const { data, error } = await db
    .from('agents')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error('getById failed: ' + error.message);
  return parseRow(data);
}

async function getByName(name) {
  var db = getSupabase();
  if (!db) { seedMemory(); var found = memAgents.find(function(a){return a.name.toLowerCase()===name.toLowerCase()}); return parseRow(found || null); }
  const { data, error } = await db
    .from('agents')
    .select('*')
    .ilike('name', name)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error('getByName failed: ' + error.message);
  return parseRow(data);
}

async function getActive() {
  var db = getSupabase();
  if (!db) { seedMemory(); return memAgents.filter(function(a){return a.status==='active'}).map(parseRow); }
  const { data, error } = await db
    .from('agents')
    .select('*')
    .eq('status', 'active')
    .order('layer')
    .order('name');

  if (error) throw new Error('getActive failed: ' + error.message);
  return (data || []).map(parseRow);
}

async function search(query, limit) {
  var db = getSupabase();
  if (!db) { seedMemory(); var ql = query.toLowerCase(); return memAgents.filter(function(a){return a.name.toLowerCase().indexOf(ql)!==-1||a.role.toLowerCase().indexOf(ql)!==-1||a.id.toLowerCase().indexOf(ql)!==-1}).slice(0,limit||50).map(parseRow); }
  var q = '%' + query + '%';
  const { data, error } = await db
    .from('agents')
    .select('*')
    .or('name.ilike.' + q + ',role.ilike.' + q + ',id.ilike.' + q)
    .order('name')
    .limit(limit || 50);

  if (error) throw new Error('search failed: ' + error.message);
  return (data || []).map(parseRow);
}

async function getByFilter(filter) {
  filter = filter || {};
  var db = getSupabase();
  if (!db) { seedMemory(); return memAgents.filter(function(a){return(!filter.layer||a.layer===filter.layer)&&(!filter.type||a.type===filter.type)&&(!filter.role||a.role===filter.role)&&(!filter.status||a.status===filter.status)}).slice(0,filter.limit||100).map(parseRow); }
  let query = db.from('agents').select('*');

  if (filter.layer)  query = query.eq('layer', filter.layer);
  if (filter.type)   query = query.eq('type', filter.type);
  if (filter.role)   query = query.eq('role', filter.role);
  if (filter.status) query = query.eq('status', filter.status);

  query = query.order('layer').order('name').limit(filter.limit || 100);

  const { data, error } = await query;
  if (error) throw new Error('getByFilter failed: ' + error.message);
  return (data || []).map(parseRow);
}

async function register(agent) {
  var id = agent.id || uid(agent.type || 'ag');
  var name = agent.name;
  if (!name) throw new Error('Agent name is required');
  var db = getSupabase();
  if (!db) { seedMemory(); if(memAgents.find(function(a){return a.id===id})) throw new Error('Agent ID already exists: '+id); if(memAgents.find(function(a){return a.name.toLowerCase()===name.toLowerCase()})) throw new Error('Agent name already taken: '+name); var r={id:id,name:name,role:agent.role||'general',layer:agent.layer||'L1',type:agent.type||'agent',source:agent.source||null,skills:agent.skills||[],status:agent.status||'active',config:agent.config||{}}; memAgents.push(r); return parseRow(r); }

  // Check if ID exists
  const { data: existingId } = await db
    .from('agents')
    .select('id')
    .eq('id', id)
    .single();
  if (existingId) throw new Error('Agent ID already exists: ' + id);

  // Check if name exists (case-insensitive)
  const { data: existingName } = await db
    .from('agents')
    .select('id')
    .ilike('name', name)
    .single();
  if (existingName) throw new Error('Agent name already taken: ' + name);

  var row = {
    id:     id,
    name:   name,
    role:   agent.role || 'general',
    layer:  agent.layer || 'L1',
    type:   agent.type || 'agent',
    source: agent.source || null,
    skills: agent.skills || [],
    status: agent.status || 'active',
    config: agent.config || {},
  };

  const { data: inserted, error: insErr } = await db
    .from('agents')
    .insert(row)
    .select()
    .single();

  if (insErr) throw new Error('register insert failed: ' + insErr.message);
  return parseRow(inserted);
}

async function update(id, changes) {
  var db = getSupabase();
  if (!db) { seedMemory(); var idx=memAgents.findIndex(function(a){return a.id===id}); if(idx===-1) throw new Error('Agent not found: '+id); Object.keys(changes).forEach(function(k){if(changes[k]!=null)memAgents[idx][k]=changes[k]}); return parseRow(memAgents[idx]); }
  var updates = {};
  if (changes.name !== undefined && changes.name !== null)   updates.name = changes.name;
  if (changes.role !== undefined && changes.role !== null)    updates.role = changes.role;
  if (changes.layer !== undefined && changes.layer !== null)  updates.layer = changes.layer;
  if (changes.type !== undefined && changes.type !== null)    updates.type = changes.type;
  if (changes.source !== undefined && changes.source !== null) updates.source = changes.source;
  if (changes.skills !== undefined)  updates.skills = changes.skills;
  if (changes.status !== undefined && changes.status !== null) updates.status = changes.status;
  if (changes.config !== undefined)  updates.config = changes.config;
  updates.updated_at = new Date().toISOString();

  const { data: updated, error } = await db
    .from('agents')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error('Agent not found or update failed: ' + id + ' — ' + error.message);
  return parseRow(updated);
}

async function remove(id) {
  var db = getSupabase();
  const agent = await getById(id);
  if (!agent) throw new Error('Agent not found: ' + id);
  if (!db) { memAgents = memAgents.filter(function(a){return a.id!==id}); return agent; }

  const { error } = await db
    .from('agents')
    .delete()
    .eq('id', id);

  if (error) throw new Error('remove failed: ' + error.message);
  return agent;
}

async function stats() {
  function countBy(rows, field) {
    var counts = {};
    (rows || []).forEach(function(r) {
      var key = r[field] || 'unknown';
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }

  var db = getSupabase();
  if (!db) { seedMemory(); return { total: memAgents.length, by_status: countBy(memAgents, 'status'), by_layer: countBy(memAgents, 'layer'), by_type: countBy(memAgents, 'type') }; }

  const { count: total } = await db.from('agents').select('*', { count: 'exact', head: true });
  const { data: statusRows } = await db.from('agents').select('status');
  const { data: layerRows } = await db.from('agents').select('layer');
  const { data: typeRows } = await db.from('agents').select('type');

  return {
    total: total || 0,
    by_status: countBy(statusRows, 'status'),
    by_layer:  countBy(layerRows, 'layer'),
    by_type:   countBy(typeRows, 'type'),
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

  // === BANKING AGENTS (Michael L2, Marvin L3) ===
  { id: 'ban-michael',         name: 'MikeBank',     role: 'banking',                layer: 'L2', type: 'ban_node', source: 'BAN/nodes/registry.py', skills: ['payment_processing', 'escrow_management', 'treasury_ops', 'settlement'] },
  { id: 'ban-marvin-tarus',    name: 'TarusBank',    role: 'banking',                layer: 'L3', type: 'ban_node', source: 'BAN/nodes/registry.py', skills: ['cross_chain_settlement', 'liquidity_provision', 'yield_optimization', 'risk_management'] },

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

function seedMemory() {
  if (memSeeded) return;
  memSeeded = true;
  memAgents = SEED_AGENTS.map(function(a) { return { id: a.id, name: a.name, role: a.role, layer: a.layer, type: a.type, source: a.source || null, skills: a.skills || [], status: a.status || 'active', config: a.config || {} }; });
  console.log('[agent-registry] Loaded ' + memAgents.length + ' agents into memory (no Supabase)');
}

async function seedIfEmpty() {
  var db = getSupabase();
  if (!db) { seedMemory(); return; }
  const { count, error } = await db
    .from('agents')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('[agent-registry] seedIfEmpty count failed:', error.message);
    return;
  }

  if ((count || 0) > 0) return; // already seeded

  // Bulk insert seed agents
  const rows = SEED_AGENTS.map(function(a) {
    return {
      id:     a.id,
      name:   a.name,
      role:   a.role,
      layer:  a.layer,
      type:   a.type,
      source: a.source || null,
      skills: a.skills || [],
      status: a.status || 'active',
      config: a.config || {},
    };
  });

  const { error: insErr } = await db
    .from('agents')
    .insert(rows);

  if (insErr) {
    console.error('[agent-registry] seed insert failed:', insErr.message);
  } else {
    console.log('[agent-registry] Seeded ' + SEED_AGENTS.length + ' agents into Supabase');
  }
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

async function resolveAgentId(nameOrId) {
  var db = getSupabase();
  if (!db) {
    seedMemory();
    if (memAgents.find(function(a){return a.id===nameOrId})) return nameOrId;
    if (LLM_NAME_MAP[nameOrId]) return LLM_NAME_MAP[nameOrId];
    var byName = memAgents.find(function(a){return a.name.toLowerCase()===nameOrId.toLowerCase()});
    return byName ? byName.id : null;
  }

  const { data: byId } = await db.from('agents').select('id').eq('id', nameOrId).single();
  if (byId) return nameOrId;

  if (LLM_NAME_MAP[nameOrId]) return LLM_NAME_MAP[nameOrId];

  const { data: byNameData } = await db.from('agents').select('id').ilike('name', nameOrId).single();
  if (byNameData) return byNameData.id;

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
  seedIfEmpty:    seedIfEmpty,
  LLM_NAME_MAP:   LLM_NAME_MAP,
  SEED_AGENTS:    SEED_AGENTS,
};
