/**
 * Real agent execution layer.
 * Each agent has a system prompt + runs via runAI().
 * Results are persisted via logAgentRun().
 */

const { runAI }                      = require('./ai');
const { logAgentRun, trackAISpend, getAISpend } = require('./db');

// Approx cost per call in Rands (gpt-4o-mini ~$0.00015/1k tokens → ~R0.003)
const COST_PER_AGENT_CALL = 0.05; // R0.05 per call — conservative estimate

const AGENT_DEFS = {
  'QuoteGen AI': {
    system: 'You are a high-conversion sales quote generator for an AI automation company. Be concise, professional, and include specific ROI numbers. Always end with a clear CTA.',
    inputPrompt: (input) => `Generate a sales quote for this prospect/requirement: ${input}`,
  },
  'Finance AI': {
    system: 'You are a financial strategist for an AI SaaS business. Provide numeric forecasts, budget allocations, and growth projections. Be specific and data-driven.',
    inputPrompt: (input) => `Analyze this financial input and provide projections: ${input}`,
  },
  'Growth Hunter': {
    system: 'You are an aggressive growth hacker for a B2B AI company. Give 3-5 immediately actionable growth tactics with expected outcomes. Be specific to the South African market where relevant.',
    inputPrompt: (input) => `Current state: ${input || 'treasury growing, 200 leads in pipeline'}. Give today\'s growth actions.`,
  },
  'Intelligence AI': {
    system: 'You are a competitive intelligence analyst. Identify market signals, competitor gaps, and strategic opportunities in the AI automation space.',
    inputPrompt: (input) => `Analyze this market context: ${input || 'South African SME AI adoption market'}`,
  },
  'Nurture AI': {
    system: 'You write personalized email nurture sequences for B2B AI prospects. Output a 3-step sequence with subject lines and key messaging points.',
    inputPrompt: (input) => `Create a nurture sequence for: ${input || 'a qualified lead interested in AI automation'}`,
  },
  'Closer AI': {
    system: 'You are a B2B sales closer. Analyze the sales situation and provide a specific closing strategy with objection handling.',
    inputPrompt: (input) => `Closing situation: ${input || 'prospect has seen demo, hasn\'t committed'}. Give closing strategy.`,
  },
  'Campaign AI': {
    system: 'You plan and optimize paid advertising campaigns for a B2B AI SaaS. Provide budget allocation, targeting, messaging, and KPIs.',
    inputPrompt: (input) => `Plan a campaign for: ${input || 'AI-OS B2B lead generation, R500/day budget'}`,
  },
  'Creative AI': {
    system: 'You generate marketing creative briefs and copy for an AI automation platform. Be compelling, outcome-focused, and modern.',
    inputPrompt: (input) => `Generate creative assets brief for: ${input || 'Bridge AI OS — autonomous business operations'}`,
  },
  'Support AI': {
    system: 'You are a technical support specialist for an AI OS platform. Triage issues, provide solutions, and identify patterns in support requests.',
    inputPrompt: (input) => `Support request: ${input || 'summarize current support queue status'}`,
  },
  'Supply AI': {
    system: 'You optimize infrastructure and API vendor costs for an AI SaaS. Identify cost reduction opportunities, routing optimizations, and efficiency gains.',
    inputPrompt: (input) => `Infrastructure context: ${input || 'current AI API spend, multi-provider setup'}. Optimize costs.`,
  },
};

/**
 * Run a single agent by name with optional input.
 * Returns { agentName, output, timestamp, persisted }
 */
async function runAgent(agentName, input = '') {
  const def = AGENT_DEFS[agentName];
  if (!def) {
    throw new Error(`Unknown agent: ${agentName}. Available: ${Object.keys(AGENT_DEFS).join(', ')}`);
  }

  // Budget guard — block if monthly AI spend exceeded
  const { spend, budget } = await getAISpend();
  if (spend > budget) {
    throw new Error(`AI monthly budget exceeded (R${spend.toFixed(2)} / R${budget}). Increase AI_MONTHLY_BUDGET or wait for reset.`);
  }

  const userMessage = def.inputPrompt(input);
  const output = await runAI(def.system, userMessage, { agentName });

  const timestamp = new Date().toISOString();
  await logAgentRun(agentName, input, { output, timestamp });
  await trackAISpend(COST_PER_AGENT_CALL);

  return { agentName, output, timestamp, persisted: true };
}

/**
 * Run all agents in parallel. Returns array of results.
 * Failed agents return an error entry rather than crashing the whole batch.
 */
async function runAllAgents() {
  const results = await Promise.allSettled(
    Object.keys(AGENT_DEFS).map(name => runAgent(name))
  );

  return results.map((r, i) => {
    const name = Object.keys(AGENT_DEFS)[i];
    if (r.status === 'fulfilled') return r.value;
    return { agentName: name, error: r.reason?.message, timestamp: new Date().toISOString() };
  });
}

/**
 * Run a specific subset of agents by name array.
 */
async function runAgents(names, input = '') {
  return Promise.all(names.map(n => runAgent(n, input).catch(e => ({ agentName: n, error: e.message }))));
}

module.exports = { runAgent, runAllAgents, runAgents, AGENT_DEFS };
