// =============================================================================
// BRIDGE AI OS — Agent Execution Server
// Universal execution layer for 10 specialized business agents.
// Each agent uses LLM reasoning, economic scoring, and ledger tracking.
// =============================================================================
'use strict';

let llm = null;
try { llm = require('./llm-client'); } catch (_) { /* LLM client not available */ }

let ledger = null;
try { ledger = require('./agent-ledger'); } catch (_) { /* Ledger not available */ }

const { success, error, agentHandler } = require('./agent-contract');
const scoring = require('./economic-scoring');

// ── Agent cost per execution (in BRDG) ───────────────────────────────────────
const AGENT_COST = 0.5;

// ── Agent hierarchy ──────────────────────────────────────────────────────────
const HIERARCHY = {
  L1: ['quote', 'finance', 'growth'],
  L2: ['intelligence', 'nurture', 'closer', 'campaign'],
  L3: ['creative', 'support', 'supply'],
};

// ── System prompts for each specialized agent ────────────────────────────────
const AGENT_PROMPTS = {
  quote: 'You are QuoteGen AI, a specialist in generating accurate business quotes, pricing proposals, and estimates. Return structured JSON with line items, totals, and terms.',
  finance: 'You are Finance AI, a specialist in financial analysis, budgeting, forecasting, and revenue optimization. Return structured JSON with metrics, projections, and recommendations.',
  growth: 'You are Growth AI, a specialist in growth strategy, user acquisition, retention funnels, and viral loops. Return structured JSON with strategies, expected impact, and timelines.',
  intelligence: 'You are Intelligence AI, a specialist in market research, competitive analysis, trend detection, and OSINT. Return structured JSON with insights, sources, and confidence scores.',
  nurture: 'You are Nurture AI, a specialist in lead nurturing, email sequences, drip campaigns, and relationship building. Return structured JSON with sequences, touchpoints, and conversion predictions.',
  closer: 'You are Closer AI, a specialist in sales closing, objection handling, negotiation tactics, and deal structuring. Return structured JSON with strategies, scripts, and probability assessments.',
  campaign: 'You are Campaign AI, a specialist in marketing campaign design, channel selection, budget allocation, and A/B testing. Return structured JSON with campaign plans, budgets, and KPIs.',
  creative: 'You are Creative AI, a specialist in content creation, copywriting, visual direction, and brand messaging. Return structured JSON with content drafts, headlines, and creative briefs.',
  support: 'You are Support AI, a specialist in customer support, ticket resolution, knowledge base management, and escalation routing. Return structured JSON with solutions, steps, and escalation paths.',
  supply: 'You are Supply AI, a specialist in supply chain optimization, vendor management, procurement, and logistics. Return structured JSON with recommendations, cost analysis, and timelines.',
};

// ── 10 Specialized agent execution functions ─────────────────────────────────
const agents = {
  quote: async (input, context) => {
    return executeWithLLM('quote', input, context, (result) => ({
      type: 'quote',
      content: result.text,
      scoring: scoring.economicScore(
        { conversionRate: 0.6, commission: 0.12, successRate: 0.85, userRating: 0.92 },
        context.user || {}
      ),
    }));
  },

  finance: async (input, context) => {
    return executeWithLLM('finance', input, context, (result) => ({
      type: 'financial_analysis',
      content: result.text,
      scoring: scoring.economicScore(
        { conversionRate: 0.4, commission: 0.15, successRate: 0.9, userRating: 0.88 },
        context.user || {}
      ),
    }));
  },

  growth: async (input, context) => {
    return executeWithLLM('growth', input, context, (result) => ({
      type: 'growth_strategy',
      content: result.text,
      scoring: scoring.economicScore(
        { conversionRate: 0.55, commission: 0.1, successRate: 0.78, userRating: 0.91 },
        context.user || {}
      ),
    }));
  },

  intelligence: async (input, context) => {
    return executeWithLLM('intelligence', input, context, (result) => ({
      type: 'market_intelligence',
      content: result.text,
      scoring: scoring.economicScore(
        { conversionRate: 0.35, commission: 0.08, successRate: 0.82, userRating: 0.87 },
        context.user || {}
      ),
    }));
  },

  nurture: async (input, context) => {
    return executeWithLLM('nurture', input, context, (result) => ({
      type: 'nurture_sequence',
      content: result.text,
      predicted_conversion: scoring.predictConversion(context.user || {}),
    }));
  },

  closer: async (input, context) => {
    return executeWithLLM('closer', input, context, (result) => ({
      type: 'closing_strategy',
      content: result.text,
      scoring: scoring.economicScore(
        { conversionRate: 0.7, commission: 0.2, successRate: 0.75, userRating: 0.93 },
        context.user || {}
      ),
    }));
  },

  campaign: async (input, context) => {
    return executeWithLLM('campaign', input, context, (result) => ({
      type: 'campaign_plan',
      content: result.text,
      scoring: scoring.economicScore(
        { conversionRate: 0.45, commission: 0.11, successRate: 0.8, userRating: 0.89 },
        context.user || {}
      ),
    }));
  },

  creative: async (input, context) => {
    return executeWithLLM('creative', input, context, (result) => ({
      type: 'creative_output',
      content: result.text,
    }));
  },

  support: async (input, context) => {
    return executeWithLLM('support', input, context, (result) => ({
      type: 'support_resolution',
      content: result.text,
      scoring: scoring.economicScore(
        { conversionRate: 0.3, commission: 0.05, successRate: 0.92, userRating: 0.95 },
        context.user || {}
      ),
    }));
  },

  supply: async (input, context) => {
    return executeWithLLM('supply', input, context, (result) => ({
      type: 'supply_chain_analysis',
      content: result.text,
      scoring: scoring.economicScore(
        { conversionRate: 0.5, commission: 0.09, successRate: 0.85, userRating: 0.88 },
        context.user || {}
      ),
    }));
  },
};

// ── LLM execution helper with ledger tracking ───────────────────────────────
async function executeWithLLM(agentName, input, context, formatter) {
  const systemPrompt = AGENT_PROMPTS[agentName];

  // Debit agent execution cost from ledger
  if (ledger) {
    try {
      await ledger.debit(`agent-exec-${agentName}`, AGENT_COST, 'execution', `Execution: ${input.slice(0, 80)}`);
    } catch (_) { /* insufficient funds is non-fatal */ }
  }

  if (!llm) {
    // Return stub response when LLM is unavailable
    const stub = {
      text: `[${agentName.toUpperCase()} AGENT] LLM unavailable — stub response for: ${input}`,
      cost_usd: 0,
      model: 'stub',
    };
    const formatted = formatter(stub);
    // Credit on completion
    if (ledger) {
      try { await ledger.credit(`agent-exec-${agentName}`, AGENT_COST * 0.5, 'stub_completion', 'Stub execution credit'); } catch (_) {}
    }
    return { ...formatted, model: 'stub', cost_usd: 0 };
  }

  const contextStr = context && Object.keys(context).length > 0
    ? '\n\nContext: ' + JSON.stringify(context)
    : '';

  const result = await llm.infer(input + contextStr, { system: systemPrompt });
  const formatted = formatter(result);

  // Credit on successful completion
  if (ledger) {
    try {
      await ledger.credit(`agent-exec-${agentName}`, AGENT_COST * 1.5, 'successful_execution', `Completed: ${input.slice(0, 80)}`);
    } catch (_) {}
  }

  return {
    ...formatted,
    model: result.model,
    cost_usd: result.cost_usd,
  };
}

// ── Agent health status ──────────────────────────────────────────────────────
async function getAgentStatus(name) {
  const agent = agents[name];
  if (!agent) return null;
  const tier = HIERARCHY.L1.includes(name) ? 'L1'
    : HIERARCHY.L2.includes(name) ? 'L2'
    : HIERARCHY.L3.includes(name) ? 'L3' : 'unknown';

  let balance = null;
  if (ledger) {
    try { balance = await ledger.getBalance(`agent-exec-${name}`); } catch (_) {}
  }

  return {
    name,
    tier,
    status: 'active',
    llm_available: !!llm,
    ledger_available: !!ledger,
    balance,
    prompt_length: (AGENT_PROMPTS[name] || '').length,
  };
}

// ── Route registration ──────────────────────────────────────────────────────
function registerAgentExecutionRoutes(app) {

  // POST /agent/:name — execute an agent with input
  app.post('/agent/:name', agentHandler('agent-execution', async (req) => {
    const { name } = req.params;
    const agent = agents[name];
    if (!agent) {
      const err = new Error(`Unknown agent: ${name}. Available: ${Object.keys(agents).join(', ')}`);
      err.statusCode = 404;
      err.code = 'AGENT_NOT_FOUND';
      throw err;
    }

    const { input, context } = req.body || {};
    if (!input || typeof input !== 'string') {
      const err = new Error('input (string) is required in request body');
      err.statusCode = 400;
      err.code = 'INVALID_INPUT';
      throw err;
    }

    const result = await agent(input, context || {});
    return { agent: name, ...result };
  }));

  // GET /agent/:name/status — agent health check
  app.get('/agent/:name/status', agentHandler('agent-status', async (req) => {
    const { name } = req.params;
    const status = await getAgentStatus(name);
    if (!status) {
      const err = new Error(`Unknown agent: ${name}`);
      err.statusCode = 404;
      err.code = 'AGENT_NOT_FOUND';
      throw err;
    }
    return status;
  }));

  // GET /agents/hierarchy — L1/L2/L3 agent hierarchy
  app.get('/agents/hierarchy', agentHandler('agent-hierarchy', async () => {
    const hierarchy = {};
    for (const [tier, names] of Object.entries(HIERARCHY)) {
      hierarchy[tier] = names.map(name => ({
        name,
        status: 'active',
        llm_available: !!llm,
      }));
    }
    return {
      hierarchy,
      total_agents: Object.keys(agents).length,
      available_agents: Object.keys(agents),
    };
  }));

  console.log('[AGENT-EXEC] Agent Execution Server registered — 10 specialized agents');
  console.log('[AGENT-EXEC] Agents: ' + Object.keys(agents).join(', '));
}

module.exports = { registerAgentExecutionRoutes, agents, HIERARCHY };
