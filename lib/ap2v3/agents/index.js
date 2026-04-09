// =============================================================================
// AP2-v3 — Agent Registry
// Loads all modular agents and provides lookup/listing/execution
// =============================================================================
'use strict';

const FinanceAgent = require('./finance');
const GrowthAgent = require('./growth');
const IntelligenceAgent = require('./intelligence');
const NurtureAgent = require('./nurture');
const CloserAgent = require('./closer');
const QuoteAgent = require('./quote');
const CampaignAgent = require('./campaign');
const CreativeAgent = require('./creative');
const SupportAgent = require('./support');
const SupplyAgent = require('./supply');

// ── Agent Instances ──────────────────────────────────────────────────────────
const agents = {
  finance: new FinanceAgent(),
  growth: new GrowthAgent(),
  intelligence: new IntelligenceAgent(),
  nurture: new NurtureAgent(),
  closer: new CloserAgent(),
  quote: new QuoteAgent(),
  campaign: new CampaignAgent(),
  creative: new CreativeAgent(),
  support: new SupportAgent(),
  supply: new SupplyAgent(),
};

// ── Registry Functions ───────────────────────────────────────────────────────

/**
 * Get an agent by name.
 * @param {string} name
 * @returns {BaseAgent|null}
 */
function getAgent(name) {
  return agents[name] || null;
}

/**
 * List all registered agents with metadata.
 * @returns {Array<object>}
 */
function listAgents() {
  return Object.entries(agents).map(([key, agent]) => ({
    name: key,
    type: agent.type,
    tier: agent.tier,
    cost: agent.costBrdg,
    skills: agent.skills,
    status: 'active',
  }));
}

/**
 * Execute an agent by name with the given context.
 * @param {string} name
 * @param {object} context - { input, memory, user, meta }
 * @returns {Promise<object>}
 */
async function executeAgent(name, context) {
  const agent = getAgent(name);
  if (!agent) {
    throw new Error(`Agent '${name}' not found. Available: ${Object.keys(agents).join(', ')}`);
  }
  return agent.execute(context);
}

/**
 * Get agents filtered by tier.
 * @param {string} tier - 'L1', 'L2', or 'L3'
 * @returns {Array<object>}
 */
function getAgentsByTier(tier) {
  return listAgents().filter(a => a.tier === tier);
}

/**
 * Get agents filtered by type.
 * @param {string} type
 * @returns {Array<object>}
 */
function getAgentsByType(type) {
  return listAgents().filter(a => a.type === type);
}

/**
 * Get agent names.
 * @returns {string[]}
 */
function getAgentNames() {
  return Object.keys(agents);
}

module.exports = {
  agents,
  AGENTS: agents,
  getAgent,
  listAgents,
  executeAgent,
  getAgentsByTier,
  getAgentsByType,
  getAgentNames,
};
