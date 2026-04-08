/**
 * BRIDGE AI OS — AP2 Identity Module
 *
 * Wraps Bridge AI agents with AP2-compatible identity profiles
 * so they can transact with external agents via Google's Agent Payments Protocol.
 */

'use strict';

const crypto = require('crypto');

// Graceful require for agent registry
let AGENTS;
try {
  // brain-agents.js exports a function; we need the AGENTS array directly
  const agentModule = require('../../brain-agents');
  // If it's a function (registerAgentEconomy), we can't call it — read AGENTS from the file
  AGENTS = null;
} catch (_) {
  AGENTS = null;
}

// Inline agent list matching brain-agents.js roster (35 agents)
function getAgentRegistry() {
  if (AGENTS && Array.isArray(AGENTS)) return AGENTS;

  // Load from brain-agents.js source — the AGENTS array is not exported,
  // so we maintain a lightweight reference list here
  try {
    const mod = require('../../brain-agents');
    // brain-agents exports a function; agents are internal. Parse from known IDs.
  } catch (_) { /* ignored */ }

  // Canonical roster (mirrors brain-agents.js)
  return [
    { id: 'agent-1-gateway', name: 'Gateway Agent', type: 'orchestrator', skills: ['routing', 'load_balancing', 'health_monitoring'], status: 'active' },
    { id: 'agent-2a-dashboard', name: 'Dashboard Agent', type: 'orchestrator', skills: ['ui_rendering', 'data_aggregation', 'event_streaming'], status: 'active' },
    { id: 'agent-3a-data', name: 'Data Agent', type: 'orchestrator', skills: ['etl', 'indexing', 'caching', 'rag'], status: 'active' },
    { id: 'agent-4a-auth', name: 'Auth Agent', type: 'orchestrator', skills: ['jwt', 'keyforge', 'mfa', 'oauth'], status: 'active' },
    { id: 'agent-5a-testing', name: 'Testing Agent', type: 'orchestrator', skills: ['integration_testing', 'load_testing', 'security_scanning'], status: 'active' },
    { id: 'agent-6a-governance', name: 'Governance Agent', type: 'orchestrator', skills: ['policy_enforcement', 'audit', 'sdg_tracking'], status: 'active' },
    { id: 'agent-l2-verifier', name: 'Verifier Agent', type: 'orchestrator', skills: ['contract_verification', 'conflict_detection', 'consensus'], status: 'active' },
    { id: 'agent-l2-streamer', name: 'Stream Agent', type: 'orchestrator', skills: ['event_streaming', 'replication', 'sync'], status: 'active' },
    { id: 'agent-l3-minimax', name: 'Minimax Optimizer', type: 'orchestrator', skills: ['minimax', 'game_theory', 'resource_optimization'], status: 'active' },
    { id: 'agent-svg-decision', name: 'Decision Engine', type: 'skill', skills: ['ethical_filter', 'confidence_scoring', 'action_routing'], status: 'active' },
    { id: 'agent-svg-economy', name: 'Economic Engine', type: 'skill', skills: ['circuit_breaker', 'exposure_tracking', 'treasury_flow'], status: 'active' },
    { id: 'agent-svg-speech', name: 'Speech Agent', type: 'skill', skills: ['tts', 'stt', 'lip_sync', 'emotion_voice'], status: 'active' },
    { id: 'agent-svg-swarm', name: 'Swarm Monitor', type: 'skill', skills: ['latency_monitor', 'utilization_tracking', 'fault_detection'], status: 'active' },
    { id: 'agent-svg-treasury', name: 'Treasury Agent', type: 'skill', skills: ['revenue_tracking', 'ubi_distribution', 'cost_optimization'], status: 'active' },
    { id: 'agent-svg-twins', name: 'Twins Manager', type: 'skill', skills: ['evolution', 'competition', 'teaching', 'leaderboard'], status: 'active' },
    { id: 'agent-svg-youtube', name: 'YouTube Learning', type: 'skill', skills: ['video_discovery', 'transcript_extraction', 'skill_learning'], status: 'active' },
    { id: 'agent-svg-flow', name: 'Flow Controller', type: 'skill', skills: ['workflow_execution', 'step_routing', 'error_handling'], status: 'active' },
    { id: 'agent-biz-sales', name: 'Sales Agent', type: 'business', skills: ['lead_gen', 'outreach', 'deal_closing', 'crm'], status: 'active' },
    { id: 'agent-biz-support', name: 'Support Agent', type: 'business', skills: ['ticket_handling', 'knowledge_base', 'escalation'], status: 'active' },
    { id: 'agent-biz-research', name: 'Research Agent', type: 'business', skills: ['market_analysis', 'competitor_intel', 'trend_detection'], status: 'active' },
    { id: 'agent-biz-marketing', name: 'Marketing Agent', type: 'business', skills: ['campaign_management', 'seo', 'social_media', 'email'], status: 'active' },
    { id: 'agent-biz-legal', name: 'Legal Agent', type: 'business', skills: ['contract_review', 'compliance', 'popia', 'gdpr'], status: 'active' },
    { id: 'agent-biz-finance', name: 'Finance Agent', type: 'business', skills: ['invoicing', 'debt_collection', 'payroll', 'reporting'], status: 'active' },
    { id: 'agent-biz-dev', name: 'Dev Agent', type: 'business', skills: ['coding', 'deployment', 'testing', 'ci_cd'], status: 'active' },
    { id: 'agent-biz-trading', name: 'Trading Agent', type: 'business', skills: ['momentum', 'arbitrage', 'sentiment', 'risk_management'], status: 'active' },
    { id: 'bossbot-alpha', name: 'Alpha Trader', type: 'bossbot', skills: ['momentum_trading', 'btc_usd'], status: 'active' },
    { id: 'bossbot-beta', name: 'Beta Arbitrage', type: 'bossbot', skills: ['cross_exchange_arb', 'eth_btc'], status: 'active' },
    { id: 'bossbot-gamma', name: 'Gamma Sentiment', type: 'bossbot', skills: ['sentiment_analysis', 'sol_usd'], status: 'paused' },
    { id: 'bossbot-delta', name: 'Delta Scalper', type: 'bossbot', skills: ['mean_reversion', 'eth_usd'], status: 'active' },
    { id: 'ban-ryan', name: 'Ryan (Node)', type: 'ban_node', skills: ['task_execution', 'high_trust'], status: 'active' },
    { id: 'ban-mike', name: 'Mike (Node)', type: 'ban_node', skills: ['task_execution', 'medium_trust'], status: 'active' },
    { id: 'ban-marvin', name: 'Marvin (Node)', type: 'ban_node', skills: ['task_execution', 'learning'], status: 'active' },
    { id: 'prime-001', name: 'Prime', type: 'prime', skills: ['reason', 'plan', 'execute', 'trade', 'teach', 'communicate', 'deploy', 'heal'], status: 'active' },
    { id: 'twin-empe-001', name: 'Bridge Twin', type: 'twin', skills: ['reasoning', 'coding', 'trading', 'communication', 'teaching'], status: 'active' },
    { id: 'treasury', name: 'Treasury', type: 'prime', skills: ['fund_management', 'distribution', 'reserves'], status: 'active' },
  ];
}

/**
 * Generate a deterministic wallet address from agent ID.
 */
function agentWallet(agentId) {
  return '0x' + crypto.createHash('sha256').update(agentId).digest('hex').slice(0, 40);
}

/**
 * Create an AP2-compatible identity profile for a Bridge AI agent.
 * @param {object} agent — agent object from brain-agents.js
 * @returns {object} AP2 profile
 */
function createAgentProfile(agent) {
  if (!agent || !agent.id) throw new Error('Invalid agent: missing id');

  return {
    agent_id: agent.id,
    name: agent.name || agent.id,
    capabilities: Array.isArray(agent.skills) ? [...agent.skills] : [],
    payment_address: agent.wallet || agentWallet(agent.id),
    protocol_version: 'ap2-v1',
    type: agent.type || 'unknown',
    status: agent.status || 'active',
    created_at: new Date().toISOString(),
  };
}

/**
 * Validate an incoming external agent profile.
 * @param {object} profile — AP2 agent profile
 * @returns {{ valid: boolean, errors: string[] }}
 */
function verifyAgent(profile) {
  const errors = [];

  if (!profile) {
    return { valid: false, errors: ['Profile is null or undefined'] };
  }
  if (!profile.agent_id || typeof profile.agent_id !== 'string') {
    errors.push('Missing or invalid agent_id');
  }
  if (!profile.name || typeof profile.name !== 'string') {
    errors.push('Missing or invalid name');
  }
  if (!Array.isArray(profile.capabilities)) {
    errors.push('capabilities must be an array');
  }
  if (!profile.payment_address || typeof profile.payment_address !== 'string') {
    errors.push('Missing or invalid payment_address');
  }
  if (profile.protocol_version !== 'ap2-v1') {
    errors.push('Unsupported protocol_version (expected ap2-v1)');
  }

  return {
    valid: errors.length === 0,
    errors,
    verified_at: new Date().toISOString(),
  };
}

/**
 * Get AP2 profiles for all 35 Bridge AI agents.
 * @returns {object[]} array of AP2 profiles
 */
function getAllProfiles() {
  const registry = getAgentRegistry();
  return registry.map(agent => createAgentProfile(agent));
}

module.exports = {
  createAgentProfile,
  verifyAgent,
  getAllProfiles,
  getAgentRegistry,
  agentWallet,
};
