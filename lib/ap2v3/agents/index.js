/**
 * BRIDGE AI OS — AP2-v3 Agent Registry
 *
 * Loads and manages the 10 specialized business agents.
 * Each agent extends BaseAgent and provides execute/score/validate.
 */

'use strict';

const BaseAgent = require('./base-agent');

// ── Agent Definitions ──────────────────────────────────────────────────────
// Each agent is a lightweight BaseAgent subclass with a system prompt and
// stub data for graceful degradation when LLM is unavailable.

function createAgent(name, config, systemPrompt, stubContent) {
  const agent = new BaseAgent(name, config);

  agent.execute = async function (context) {
    const memory = context.memory || [];
    const memoryContext = memory.length > 0
      ? '\n\nPrevious context:\n' + memory.map(m => '- [' + m.agent + '] ' + m.input).join('\n')
      : '';
    const prompt = context.input + memoryContext;
    const llmResult = await this.callLLM(systemPrompt, prompt, { summary: stubContent });
    const parsed = this.parseResponse(llmResult.text, { summary: stubContent });
    return {
      content: parsed.summary || parsed.content || stubContent,
      raw: parsed,
      tokens: llmResult.cost ? Math.round(llmResult.cost * 100000) : 0,
      fromLLM: llmResult.fromLLM,
      provider: llmResult.provider,
    };
  };

  agent.score = function (result, context) {
    return this.computeEconomicScore(result, context);
  };

  return agent;
}

// ── The 10 Specialized Agents ──────────────────────────────────────────────

const AGENTS = {};

AGENTS.finance = createAgent('finance', {
  type: 'finance', tier: 'L2', costBrdg: 8, skills: ['revenue', 'roi', 'budget', 'forecasting'],
}, 'You are a financial analyst for Bridge AI OS. Analyze revenue, ROI, profit margins, and budgets. Return JSON with summary, metrics, and recommendations.',
  'Financial analysis: Revenue trending upward. ROI projections positive. Budget allocation optimized.');

AGENTS.growth = createAgent('growth', {
  type: 'growth', tier: 'L2', costBrdg: 7, skills: ['acquisition', 'channels', 'viral', 'scaling'],
}, 'You are a growth strategist for Bridge AI OS. Identify acquisition channels, viral loops, and scaling strategies. Return JSON with summary, channels, and metrics.',
  'Growth analysis: Multiple acquisition channels identified. Viral coefficient estimated at 1.2.');

AGENTS.intelligence = createAgent('intelligence', {
  type: 'research', tier: 'L2', costBrdg: 6, skills: ['analysis', 'market', 'competitor', 'trends'],
}, 'You are a market intelligence analyst for Bridge AI OS. Research markets, competitors, and trends. Return JSON with summary, findings, and opportunities.',
  'Market intelligence: Competitive landscape analyzed. Key trends identified. Opportunities mapped.');

AGENTS.nurture = createAgent('nurture', {
  type: 'nurture', tier: 'L1', costBrdg: 4, skills: ['follow-up', 'engagement', 'sequences', 'warming'],
}, 'You are a lead nurture specialist for Bridge AI OS. Create follow-up sequences and engagement strategies. Return JSON with summary, sequence, and timing.',
  'Nurture sequence: 5-step engagement plan created. Optimal timing identified.');

AGENTS.closer = createAgent('closer', {
  type: 'sales', tier: 'L3', costBrdg: 10, skills: ['closing', 'deals', 'conversion', 'negotiation'],
}, 'You are a deal closer for Bridge AI OS. Analyze deals, craft closing strategies, and optimize conversion. Return JSON with summary, strategy, and confidence.',
  'Closing strategy: Deal positioned for close. Key objections addressed. Confidence: 78%.');

AGENTS.quote = createAgent('quote', {
  type: 'pricing', tier: 'L2', costBrdg: 6, skills: ['quoting', 'pricing', 'proposals', 'estimates'],
}, 'You are a pricing and quoting specialist for Bridge AI OS. Generate accurate quotes, proposals, and estimates. Return JSON with summary, line_items, and total.',
  'Quote generated: Itemized proposal prepared. Competitive pricing applied. Total calculated.');

AGENTS.campaign = createAgent('campaign', {
  type: 'marketing', tier: 'L2', costBrdg: 7, skills: ['campaigns', 'ads', 'promotion', 'launches'],
}, 'You are a campaign strategist for Bridge AI OS. Design marketing campaigns, ad strategies, and launch plans. Return JSON with summary, channels, budget, and timeline.',
  'Campaign plan: Multi-channel strategy designed. Budget allocated. Timeline set for 4 weeks.');

AGENTS.creative = createAgent('creative', {
  type: 'content', tier: 'L1', costBrdg: 5, skills: ['writing', 'headlines', 'copy', 'content'],
}, 'You are a creative content specialist for Bridge AI OS. Write compelling copy, headlines, and content. Return JSON with summary, content, and variations.',
  'Creative output: Headline variations generated. Copy optimized for conversion. A/B options ready.');

AGENTS.support = createAgent('support', {
  type: 'support', tier: 'L1', costBrdg: 3, skills: ['help', 'tickets', 'issues', 'resolution'],
}, 'You are a support specialist for Bridge AI OS. Resolve issues, answer questions, and manage tickets. Return JSON with summary, resolution, and follow_up.',
  'Support resolution: Issue diagnosed. Solution provided. Follow-up scheduled.');

AGENTS.supply = createAgent('supply', {
  type: 'supply', tier: 'L2', costBrdg: 6, skills: ['vendors', 'suppliers', 'inventory', 'sourcing'],
}, 'You are a supply chain specialist for Bridge AI OS. Manage vendors, optimize inventory, and source materials. Return JSON with summary, suppliers, and costs.',
  'Supply analysis: Vendor options evaluated. Inventory levels optimized. Cost savings identified.');

// ── Registry Functions ─────────────────────────────────────────────────────

/**
 * Get a named agent.
 * @param {string} name
 * @returns {BaseAgent|null}
 */
function getAgent(name) {
  return AGENTS[name] || null;
}

/**
 * List all registered agents with status.
 * @returns {Array}
 */
function listAgents() {
  return Object.entries(AGENTS).map(([name, agent]) => ({
    name,
    type: agent.type,
    tier: agent.tier,
    costBrdg: agent.costBrdg,
    skills: agent.skills,
    status: 'active',
  }));
}

/**
 * Get agent names.
 * @returns {string[]}
 */
function getAgentNames() {
  return Object.keys(AGENTS);
}

module.exports = {
  getAgent,
  listAgents,
  getAgentNames,
  AGENTS,
};
