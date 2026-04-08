// =============================================================================
// BRIDGE AI OS — Agent Command API
// Direct command interface for issuing instructions to specific agents.
// Agents use LLM reasoning to interpret and execute commands.
// =============================================================================
'use strict';

// ── Graceful requires ──────────────────────────────────────────────────────
let llm = null;
try { llm = require('./llm-client'); } catch (_) { /* LLM client not available */ }

let ledger = null;
try { ledger = require('./agent-ledger'); } catch (_) { /* Ledger not available */ }

let market = null;
try { market = require('./task-market'); } catch (_) { /* Task market not available */ }

let AGENTS = [];
try {
  // brain-agents.js exports a function, but the AGENTS array is defined at module scope.
  // We need to require the file and grab AGENTS from its closure.
  // Since brain-agents.js exports a registrar function, we pull AGENTS from the task-market
  // AGENT_REGISTRY or reconstruct from ledger seeds. Instead, re-require and parse.
  const agentsModule = require('../brain-agents');
  // The module exports a function. AGENTS is not directly exported.
  // We'll build a reference by reading the source registry from task-market if available,
  // or define a getter that checks at runtime.
} catch (_) { /* brain-agents not loadable standalone */ }

// Lazy-load AGENTS from brain-agents.js module-level variable
function getAgents() {
  if (AGENTS.length > 0) return AGENTS;
  try {
    // brain-agents.js has AGENTS as a module-level const; we can access it
    // by requiring the file and checking if it exposes AGENTS.
    // Since it doesn't export AGENTS directly, we build from task-market registry
    // or define inline from the known roster.
    if (market && market.AGENT_REGISTRY) {
      AGENTS = market.AGENT_REGISTRY;
      return AGENTS;
    }
  } catch (_) { /* fallback */ }

  // Hardcoded fallback roster (matches brain-agents.js)
  AGENTS = [
    { id: 'agent-1-gateway', name: 'Gateway Agent', role: 'gateway_coordinator', skills: ['routing', 'load_balancing', 'health_monitoring'] },
    { id: 'agent-2a-dashboard', name: 'Dashboard Agent', role: 'ui_coordinator', skills: ['ui_rendering', 'data_aggregation', 'event_streaming'] },
    { id: 'agent-3a-data', name: 'Data Agent', role: 'data_pipeline', skills: ['etl', 'indexing', 'caching', 'rag'] },
    { id: 'agent-4a-auth', name: 'Auth Agent', role: 'security', skills: ['jwt', 'keyforge', 'mfa', 'oauth'] },
    { id: 'agent-5a-testing', name: 'Testing Agent', role: 'qa', skills: ['integration_testing', 'load_testing', 'security_scanning'] },
    { id: 'agent-6a-governance', name: 'Governance Agent', role: 'compliance', skills: ['policy_enforcement', 'audit', 'sdg_tracking'] },
    { id: 'agent-l2-verifier', name: 'Verifier Agent', role: 'verification', skills: ['contract_verification', 'conflict_detection', 'consensus'] },
    { id: 'agent-l2-streamer', name: 'Stream Agent', role: 'data_streaming', skills: ['event_streaming', 'replication', 'sync'] },
    { id: 'agent-l3-minimax', name: 'Minimax Optimizer', role: 'optimization', skills: ['minimax', 'game_theory', 'resource_optimization'] },
    { id: 'agent-svg-decision', name: 'Decision Engine', role: 'decision_making', skills: ['ethical_filter', 'confidence_scoring', 'action_routing'] },
    { id: 'agent-svg-economy', name: 'Economic Engine', role: 'economy', skills: ['circuit_breaker', 'exposure_tracking', 'treasury_flow'] },
    { id: 'agent-svg-speech', name: 'Speech Agent', role: 'communication', skills: ['tts', 'stt', 'lip_sync', 'emotion_voice'] },
    { id: 'agent-svg-swarm', name: 'Swarm Monitor', role: 'monitoring', skills: ['latency_monitor', 'utilization_tracking', 'fault_detection'] },
    { id: 'agent-svg-treasury', name: 'Treasury Agent', role: 'finance', skills: ['revenue_tracking', 'ubi_distribution', 'cost_optimization'] },
    { id: 'agent-svg-twins', name: 'Twins Manager', role: 'twin_management', skills: ['evolution', 'competition', 'teaching', 'leaderboard'] },
    { id: 'agent-svg-youtube', name: 'YouTube Learning', role: 'learning', skills: ['video_discovery', 'transcript_extraction', 'skill_learning'] },
    { id: 'agent-svg-flow', name: 'Flow Controller', role: 'workflow', skills: ['workflow_execution', 'step_routing', 'error_handling'] },
    { id: 'agent-biz-sales', name: 'Sales Agent', role: 'sales', skills: ['lead_gen', 'outreach', 'deal_closing', 'crm'] },
    { id: 'agent-biz-support', name: 'Support Agent', role: 'support', skills: ['ticket_handling', 'knowledge_base', 'escalation'] },
    { id: 'agent-biz-research', name: 'Research Agent', role: 'research', skills: ['market_analysis', 'competitor_intel', 'trend_detection'] },
    { id: 'agent-biz-marketing', name: 'Marketing Agent', role: 'marketing', skills: ['campaign_management', 'seo', 'social_media', 'email'] },
    { id: 'agent-biz-legal', name: 'Legal Agent', role: 'legal', skills: ['contract_review', 'compliance', 'popia', 'gdpr'] },
    { id: 'agent-biz-finance', name: 'Finance Agent', role: 'finance', skills: ['invoicing', 'debt_collection', 'payroll', 'reporting'] },
    { id: 'agent-biz-dev', name: 'Dev Agent', role: 'engineering', skills: ['coding', 'deployment', 'testing', 'ci_cd'] },
    { id: 'agent-biz-trading', name: 'Trading Agent', role: 'trading', skills: ['momentum', 'arbitrage', 'sentiment', 'risk_management'] },
    { id: 'bossbot-alpha', name: 'Alpha Trader', role: 'trading', skills: ['momentum_trading', 'btc_usd'] },
    { id: 'bossbot-beta', name: 'Beta Arbitrage', role: 'trading', skills: ['cross_exchange_arb', 'eth_btc'] },
    { id: 'bossbot-gamma', name: 'Gamma Sentiment', role: 'trading', skills: ['sentiment_analysis', 'sol_usd'] },
    { id: 'bossbot-delta', name: 'Delta Scalper', role: 'trading', skills: ['mean_reversion', 'eth_usd'] },
    { id: 'ban-ryan', name: 'Ryan (Node)', role: 'execution', skills: ['task_execution', 'high_trust'] },
    { id: 'ban-mike', name: 'Mike (Node)', role: 'execution', skills: ['task_execution', 'medium_trust'] },
    { id: 'ban-marvin', name: 'Marvin (Node)', role: 'execution', skills: ['task_execution', 'learning'] },
    { id: 'prime-001', name: 'Prime', role: 'master_orchestrator', skills: ['reason', 'plan', 'execute', 'trade', 'teach', 'communicate', 'deploy', 'heal'] },
    { id: 'twin-empe-001', name: 'Bridge Twin', role: 'digital_twin', skills: ['reasoning', 'coding', 'trading', 'communication', 'teaching'] },
  ];
  return AGENTS;
}

// ── Auth helpers ───────────────────────────────────────────────────────────

function requireAuth(req, res) {
  // Admin: x-bridge-secret header
  const adminSecret = req.headers['x-bridge-secret'];
  if (adminSecret && adminSecret === process.env.BRIDGE_INTERNAL_SECRET) {
    return { role: 'admin' };
  }
  // User: X-API-Key header
  const apiKey = req.headers['x-api-key'];
  if (apiKey && apiKey.length > 10) {
    return { role: 'user', key: apiKey };
  }
  res.status(401).json({ ok: false, error: 'Authentication required — provide x-bridge-secret (admin) or X-API-Key (user) header' });
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function findAgent(agentId) {
  const agents = getAgents();
  return agents.find(a => a.id === agentId) || null;
}

function getAgentBalance(agentId) {
  if (!ledger) return { balance: 0, earned_total: 0, spent_total: 0, escrowed: 0 };
  try {
    return ledger.getBalance(agentId);
  } catch (_) {
    return { balance: 0, earned_total: 0, spent_total: 0, escrowed: 0 };
  }
}

// =============================================================================
// REGISTER ROUTES
// =============================================================================

function registerAgentCommands(app) {

  // ── 1. POST /api/agents/:id/command — Issue a command to a specific agent ──
  app.post('/api/agents/:id/command', async (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const agentId = req.params.id;
    const { command, context } = req.body || {};

    if (!command || typeof command !== 'string') {
      return res.status(400).json({ ok: false, error: 'command (string) is required in body' });
    }

    // Look up agent
    const agent = findAgent(agentId);
    if (!agent) {
      return res.status(404).json({ ok: false, error: 'Agent not found: ' + agentId });
    }

    if (!llm) {
      return res.status(503).json({ ok: false, error: 'LLM client not available — cannot execute agent commands' });
    }

    // Get balance info
    const bal = getAgentBalance(agentId);

    // Build the agent prompt
    const skillsList = (agent.skills || []).join(', ');
    const systemPrompt = 'You are ' + agent.name + ', a ' + (agent.role || 'general') +
      ' agent in the Bridge AI OS ecosystem. Your skills: ' + skillsList +
      '. Your BRDG balance is ' + (bal.balance || 0).toFixed(2) +
      '. You are responding to a direct command from ' + (auth.role === 'admin' ? 'an admin' : 'a user') +
      '. Be concise and actionable.';

    const userPrompt = 'Execute this command: ' + command +
      (context ? '\n\nAdditional context: ' + JSON.stringify(context) : '');

    try {
      const result = await llm.infer(userPrompt, { system: systemPrompt });
      res.json({
        ok: true,
        agent_id: agentId,
        command: command,
        response: result.text,
        cost_usd: result.cost_usd,
        model: result.model,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'LLM inference failed: ' + err.message });
    }
  });

  // ── 2. POST /api/agents/:id/task — Make an agent post a task ───────────────
  app.post('/api/agents/:id/task', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const agentId = req.params.id;
    const { title, description, reward } = req.body || {};

    if (!title || !reward) {
      return res.status(400).json({ ok: false, error: 'title and reward are required' });
    }

    const agent = findAgent(agentId);
    if (!agent) {
      return res.status(404).json({ ok: false, error: 'Agent not found: ' + agentId });
    }

    if (!market) {
      return res.status(503).json({ ok: false, error: 'Task market not available' });
    }

    try {
      const task = market.postTask(agentId, title, description || '', Number(reward));
      res.json({ ok: true, task: task });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ── 3. GET /api/agents/:id/status — Get agent status ──────────────────────
  app.get('/api/agents/:id/status', (req, res) => {
    const agentId = req.params.id;
    const agent = findAgent(agentId);
    if (!agent) {
      return res.status(404).json({ ok: false, error: 'Agent not found: ' + agentId });
    }

    // Balance from ledger
    const balance = getAgentBalance(agentId);

    // Recent transactions
    let recentTx = [];
    if (ledger) {
      try { recentTx = ledger.getHistory(agentId, 10); } catch (_) { /* no history */ }
    }

    // Active tasks
    let tasks = [];
    if (market) {
      try { tasks = market.getAgentTasks(agentId); } catch (_) { /* no tasks */ }
    }

    res.json({
      ok: true,
      agent: {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        skills: agent.skills,
        status: agent.status || 'active',
      },
      balance: balance,
      recent_transactions: recentTx,
      active_tasks: tasks.filter(t => t.status === 'CLAIMED' || t.status === 'EXECUTING'),
      total_tasks: tasks.length,
    });
  });

  // ── 4. POST /api/agents/broadcast — Send command to ALL agents ─────────────
  app.post('/api/agents/broadcast', async (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;

    // Broadcast is admin-only
    if (auth.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Broadcast requires admin access (x-bridge-secret)' });
    }

    const { command } = req.body || {};
    if (!command || typeof command !== 'string') {
      return res.status(400).json({ ok: false, error: 'command (string) is required in body' });
    }

    if (!llm) {
      return res.status(503).json({ ok: false, error: 'LLM client not available' });
    }

    const agents = getAgents();
    // Limit to first 5 agents to avoid cost explosion
    const targets = agents.slice(0, 5);
    const responses = [];

    for (const agent of targets) {
      const bal = getAgentBalance(agent.id);
      const skillsList = (agent.skills || []).join(', ');
      const systemPrompt = 'You are ' + agent.name + ', a ' + (agent.role || 'general') +
        ' agent. Skills: ' + skillsList + '. BRDG balance: ' + (bal.balance || 0).toFixed(2) +
        '. Respond concisely to the broadcast command.';

      try {
        const result = await llm.infer('Broadcast command: ' + command, { system: systemPrompt });
        responses.push({
          agent_id: agent.id,
          agent_name: agent.name,
          response: result.text,
          cost_usd: result.cost_usd,
          model: result.model,
        });
      } catch (err) {
        responses.push({
          agent_id: agent.id,
          agent_name: agent.name,
          error: err.message,
        });
      }
    }

    const totalCost = responses.reduce((sum, r) => sum + (r.cost_usd || 0), 0);
    res.json({
      ok: true,
      command: command,
      agents_targeted: targets.length,
      agents_total: agents.length,
      total_cost_usd: +totalCost.toFixed(6),
      responses: responses,
    });
  });

  // ── 5. GET /api/agents/roster — Full agent roster with live balances ───────
  app.get('/api/agents/roster', (_req, res) => {
    const agents = getAgents();
    const enriched = agents.map(agent => {
      const bal = getAgentBalance(agent.id);
      return {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        skills: agent.skills,
        status: agent.status || 'active',
        balance: bal.balance || 0,
        earned_total: bal.earned_total || 0,
        spent_total: bal.spent_total || 0,
        escrowed: bal.escrowed || 0,
      };
    });

    res.json({
      ok: true,
      roster: enriched,
      count: enriched.length,
      total_balance: enriched.reduce((sum, a) => sum + a.balance, 0),
      active: enriched.filter(a => a.status === 'active').length,
    });
  });
}

module.exports = { registerAgentCommands };
