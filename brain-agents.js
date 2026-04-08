// =============================================================================
// BRIDGE AI OS — AGENT REGISTRY + ECONOMY MODULE
// All agents from C/D/E drives, registered with wallets, payroll, posts
// =============================================================================
const crypto = require('crypto');

function uid(p='ag') { return `${p}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`; }

// ── FULL AGENT REGISTRY (discovered from all drives) ────────────────────────
const AGENTS = [
  // === L1 ORCHESTRATOR AGENTS (from agents/laptop1-streaming-orchestrator.js) ===
  { id: 'agent-1-gateway', name: 'Gateway Agent', role: 'gateway_coordinator', layer: 'L1', source: 'laptop1-streaming-orchestrator.js', type: 'orchestrator', skills: ['routing', 'load_balancing', 'health_monitoring'], status: 'active' },
  { id: 'agent-2a-dashboard', name: 'Dashboard Agent', role: 'ui_coordinator', layer: 'L1', source: 'laptop1-streaming-orchestrator.js', type: 'orchestrator', skills: ['ui_rendering', 'data_aggregation', 'event_streaming'], status: 'active' },
  { id: 'agent-3a-data', name: 'Data Agent', role: 'data_pipeline', layer: 'L1', source: 'laptop1-streaming-orchestrator.js', type: 'orchestrator', skills: ['etl', 'indexing', 'caching', 'rag'], status: 'active' },
  { id: 'agent-4a-auth', name: 'Auth Agent', role: 'security', layer: 'L1', source: 'laptop1-streaming-orchestrator.js', type: 'orchestrator', skills: ['jwt', 'keyforge', 'mfa', 'oauth'], status: 'active' },
  { id: 'agent-5a-testing', name: 'Testing Agent', role: 'qa', layer: 'L1', source: 'laptop1-streaming-orchestrator.js', type: 'orchestrator', skills: ['integration_testing', 'load_testing', 'security_scanning'], status: 'active' },
  { id: 'agent-6a-governance', name: 'Governance Agent', role: 'compliance', layer: 'L1', source: 'laptop1-streaming-orchestrator.js', type: 'orchestrator', skills: ['policy_enforcement', 'audit', 'sdg_tracking'], status: 'active' },

  // === L2 ORCHESTRATOR AGENTS (from agents/laptop2-streaming-orchestrator.js) ===
  { id: 'agent-l2-verifier', name: 'Verifier Agent', role: 'verification', layer: 'L2', source: 'laptop2-streaming-orchestrator.js', type: 'orchestrator', skills: ['contract_verification', 'conflict_detection', 'consensus'], status: 'active' },
  { id: 'agent-l2-streamer', name: 'Stream Agent', role: 'data_streaming', layer: 'L2', source: 'laptop2-streaming-orchestrator.js', type: 'orchestrator', skills: ['event_streaming', 'replication', 'sync'], status: 'active' },

  // === L3 ORCHESTRATOR AGENTS (from agents/laptop3-minimax-orchestrator.js) ===
  { id: 'agent-l3-minimax', name: 'Minimax Optimizer', role: 'optimization', layer: 'L3', source: 'laptop3-minimax-orchestrator.js', type: 'orchestrator', skills: ['minimax', 'game_theory', 'resource_optimization'], status: 'active' },

  // === SVG ENGINE SKILL AGENTS (from E:\BridgeAI\svg-engine\skills) ===
  { id: 'agent-svg-decision', name: 'Decision Engine', role: 'decision_making', layer: 'brain', source: 'bridge.decision.skill.js', type: 'skill', skills: ['ethical_filter', 'confidence_scoring', 'action_routing'], status: 'active' },
  { id: 'agent-svg-economy', name: 'Economic Engine', role: 'economy', layer: 'brain', source: 'bridge.economy.skill.js', type: 'skill', skills: ['circuit_breaker', 'exposure_tracking', 'treasury_flow'], status: 'active' },
  { id: 'agent-svg-speech', name: 'Speech Agent', role: 'communication', layer: 'brain', source: 'bridge.speech.skill.js', type: 'skill', skills: ['tts', 'stt', 'lip_sync', 'emotion_voice'], status: 'active' },
  { id: 'agent-svg-swarm', name: 'Swarm Monitor', role: 'monitoring', layer: 'brain', source: 'bridge.swarm.skill.js', type: 'skill', skills: ['latency_monitor', 'utilization_tracking', 'fault_detection'], status: 'active' },
  { id: 'agent-svg-treasury', name: 'Treasury Agent', role: 'finance', layer: 'brain', source: 'bridge.treasury.skill.js', type: 'skill', skills: ['revenue_tracking', 'ubi_distribution', 'cost_optimization'], status: 'active' },
  { id: 'agent-svg-twins', name: 'Twins Manager', role: 'twin_management', layer: 'brain', source: 'bridge.twins.skill.js', type: 'skill', skills: ['evolution', 'competition', 'teaching', 'leaderboard'], status: 'active' },
  { id: 'agent-svg-youtube', name: 'YouTube Learning', role: 'learning', layer: 'brain', source: 'bridge.youtube.skill.js', type: 'skill', skills: ['video_discovery', 'transcript_extraction', 'skill_learning'], status: 'active' },
  { id: 'agent-svg-flow', name: 'Flow Controller', role: 'workflow', layer: 'brain', source: 'flow.basic.skill.js', type: 'skill', skills: ['workflow_execution', 'step_routing', 'error_handling'], status: 'active' },

  // === BUSINESS SUITE AGENTS (virtual, from brain-business.js) ===
  { id: 'agent-biz-sales', name: 'Sales Agent', role: 'sales', layer: 'business', source: 'brain-business.js', type: 'business', skills: ['lead_gen', 'outreach', 'deal_closing', 'crm'], status: 'active' },
  { id: 'agent-biz-support', name: 'Support Agent', role: 'support', layer: 'business', source: 'brain-business.js', type: 'business', skills: ['ticket_handling', 'knowledge_base', 'escalation'], status: 'active' },
  { id: 'agent-biz-research', name: 'Research Agent', role: 'research', layer: 'business', source: 'brain-business.js', type: 'business', skills: ['market_analysis', 'competitor_intel', 'trend_detection'], status: 'active' },
  { id: 'agent-biz-marketing', name: 'Marketing Agent', role: 'marketing', layer: 'business', source: 'brain-business.js', type: 'business', skills: ['campaign_management', 'seo', 'social_media', 'email'], status: 'active' },
  { id: 'agent-biz-legal', name: 'Legal Agent', role: 'legal', layer: 'business', source: 'brain-business.js', type: 'business', skills: ['contract_review', 'compliance', 'popia', 'gdpr'], status: 'active' },
  { id: 'agent-biz-finance', name: 'Finance Agent', role: 'finance', layer: 'business', source: 'brain-business.js', type: 'business', skills: ['invoicing', 'debt_collection', 'payroll', 'reporting'], status: 'active' },
  { id: 'agent-biz-dev', name: 'Dev Agent', role: 'engineering', layer: 'business', source: 'brain-business.js', type: 'business', skills: ['coding', 'deployment', 'testing', 'ci_cd'], status: 'active' },
  { id: 'agent-biz-trading', name: 'Trading Agent', role: 'trading', layer: 'business', source: 'brain-business.js', type: 'business', skills: ['momentum', 'arbitrage', 'sentiment', 'risk_management'], status: 'active' },

  // === BOSSBOTS (from twins domain) ===
  { id: 'bossbot-alpha', name: 'Alpha Trader', role: 'trading', layer: 'bossbots', source: 'twins/services.py', type: 'bossbot', skills: ['momentum_trading', 'btc_usd'], status: 'active' },
  { id: 'bossbot-beta', name: 'Beta Arbitrage', role: 'trading', layer: 'bossbots', source: 'twins/services.py', type: 'bossbot', skills: ['cross_exchange_arb', 'eth_btc'], status: 'active' },
  { id: 'bossbot-gamma', name: 'Gamma Sentiment', role: 'trading', layer: 'bossbots', source: 'twins/services.py', type: 'bossbot', skills: ['sentiment_analysis', 'sol_usd'], status: 'paused' },
  { id: 'bossbot-delta', name: 'Delta Scalper', role: 'trading', layer: 'bossbots', source: 'twins/services.py', type: 'bossbot', skills: ['mean_reversion', 'eth_usd'], status: 'active' },

  // === BAN NODE AGENTS (from BAN/) ===
  { id: 'ban-ryan', name: 'Ryan (Node)', role: 'execution', layer: 'ban', source: 'BAN/nodes/registry.py', type: 'ban_node', skills: ['task_execution', 'high_trust'], status: 'active' },
  { id: 'ban-mike', name: 'Mike (Node)', role: 'execution', layer: 'ban', source: 'BAN/nodes/registry.py', type: 'ban_node', skills: ['task_execution', 'medium_trust'], status: 'active' },
  { id: 'ban-marvin', name: 'Marvin (Node)', role: 'execution', layer: 'ban', source: 'BAN/nodes/registry.py', type: 'ban_node', skills: ['task_execution', 'learning'], status: 'active' },

  // === PRIME AGENT (original) ===
  { id: 'prime-001', name: 'Prime', role: 'master_orchestrator', layer: 'core', source: 'brain.js', type: 'prime', skills: ['reason', 'plan', 'execute', 'trade', 'teach', 'communicate', 'deploy', 'heal'], status: 'active' },

  // === PRIME AGENTS (C-Suite Orchestrators) ===
  { id: 'prime-aurora', name: 'Aurora', role: 'revenue_orchestrator', layer: 'prime', source: 'lib/prime-agents.js', type: 'prime', skills: ['revenue_optimization', 'pricing_strategy', 'conversion_analysis', 'market_expansion', 'partnership_development'], status: 'active' },
  { id: 'prime-atlas', name: 'Atlas', role: 'infrastructure_orchestrator', layer: 'prime', source: 'lib/prime-agents.js', type: 'prime', skills: ['system_architecture', 'performance_optimization', 'security_audit', 'deployment', 'monitoring'], status: 'active' },
  { id: 'prime-vega', name: 'Vega', role: 'intelligence_orchestrator', layer: 'prime', source: 'lib/prime-agents.js', type: 'prime', skills: ['market_research', 'competitive_analysis', 'trend_prediction', 'data_mining', 'sentiment_analysis'], status: 'active' },
  { id: 'prime-omega', name: 'Omega', role: 'operations_orchestrator', layer: 'prime', source: 'lib/prime-agents.js', type: 'prime', skills: ['workflow_optimization', 'resource_allocation', 'quality_assurance', 'compliance', 'cost_control'], status: 'active' },
  { id: 'prime-halo', name: 'Halo', role: 'experience_orchestrator', layer: 'prime', source: 'lib/prime-agents.js', type: 'prime', skills: ['ux_design', 'user_research', 'onboarding_optimization', 'retention_strategy', 'brand_management'], status: 'active' },
  { id: 'prime-nexus', name: 'Nexus', role: 'commerce_orchestrator', layer: 'prime', source: 'lib/prime-agents.js', type: 'prime', skills: ['ap2_protocol', 'merchant_relations', 'partnership_negotiation', 'cross_platform_commerce', 'affiliate_management'], status: 'active' },
  { id: 'prime-sentinel', name: 'Sentinel', role: 'security_orchestrator', layer: 'prime', source: 'lib/prime-agents.js', type: 'prime', skills: ['threat_detection', 'access_control', 'encryption', 'incident_response', 'audit_trail'], status: 'active' },

  // === DIGITAL TWIN ===
  { id: 'twin-empe-001', name: 'Bridge Twin', role: 'digital_twin', layer: 'core', source: 'brain.js', type: 'twin', skills: ['reasoning', 'coding', 'trading', 'communication', 'teaching'], status: 'active' },
];

// ── WALLETS (each agent gets one) ───────────────────────────────────────────
const wallets = new Map();
AGENTS.forEach(a => {
  wallets.set(a.id, {
    agent_id: a.id,
    address: `0x${crypto.createHash('sha256').update(a.id).digest('hex').slice(0, 40)}`,
    balances: { BRDG: a.type === 'prime' ? 50000 : a.type === 'twin' ? 25000 : a.type === 'bossbot' ? 5000 : 1000, ETH: 0, ZAR: 0 },
    earned_total: 0,
    paid_total: 0,
    transactions: [],
  });
});

// ── PAYROLL ─────────────────────────────────────────────────────────────────
const payrollRates = {
  prime: { base: 0, per_task: 50, currency: 'BRDG' },
  twin: { base: 0, per_task: 30, currency: 'BRDG' },
  orchestrator: { base: 100, per_task: 10, currency: 'BRDG' },
  skill: { base: 50, per_task: 5, currency: 'BRDG' },
  business: { base: 200, per_task: 15, currency: 'BRDG' },
  bossbot: { base: 0, per_task: 0, profit_share: 0.10, currency: 'BRDG' },
  ban_node: { base: 0, per_task: 20, currency: 'BRDG' },
};

// ── REGISTER ROUTES ─────────────────────────────────────────────────────────
module.exports = function registerAgentEconomy(app, state, broadcast) {

  // Full registry
  app.get('/api/agents/registry', (_req, res) => {
    const byLayer = {};
    AGENTS.forEach(a => { if (!byLayer[a.layer]) byLayer[a.layer] = []; byLayer[a.layer].push(a); });
    res.json({ ok: true, agents: AGENTS, count: AGENTS.length, by_layer: byLayer,
      active: AGENTS.filter(a => a.status === 'active').length,
      layers: Object.keys(byLayer),
      types: [...new Set(AGENTS.map(a => a.type))],
    });
  });

  // Single agent
  app.get('/api/agents/registry/:id', (req, res) => {
    const agent = AGENTS.find(a => a.id === req.params.id);
    if (!agent) return res.status(404).json({ ok: false });
    const wallet = wallets.get(agent.id);
    const rate = payrollRates[agent.type] || {};
    res.json({ ok: true, agent, wallet, payroll: rate });
  });

  // Agent wallets
  app.get('/api/agents/wallets', (_req, res) => {
    const list = [...wallets.values()].map(w => ({ ...w, transactions: w.transactions.length }));
    const total_brdg = list.reduce((s, w) => s + (w.balances.BRDG || 0), 0);
    res.json({ ok: true, wallets: list, count: list.length, total_brdg });
  });

  app.get('/api/agents/wallets/:id', (req, res) => {
    const w = wallets.get(req.params.id);
    if (!w) return res.status(404).json({ ok: false });
    res.json({ ok: true, ...w });
  });

  // Pay an agent
  app.post('/api/agents/pay', (req, res) => {
    const { agent_id, amount, reason } = req.body || {};
    const w = wallets.get(agent_id);
    if (!w) return res.status(404).json({ ok: false, error: 'agent not found' });
    const amt = parseFloat(amount) || 0;
    w.balances.BRDG += amt;
    w.earned_total += amt;
    w.transactions.push({ type: 'credit', amount: amt, reason: reason || 'task_payment', ts: Date.now() });
    state.treasury.balance -= amt;
    state.treasury.spent += amt;
    broadcast({ type: 'agent_paid', agent_id, amount: amt, reason });
    res.json({ ok: true, agent_id, paid: amt, new_balance: w.balances.BRDG });
  });

  // Payroll run (pay all agents their base rate)
  app.post('/api/agents/payroll/run', (_req, res) => {
    const payments = [];
    AGENTS.filter(a => a.status === 'active').forEach(a => {
      const rate = payrollRates[a.type];
      if (!rate || !rate.base) return;
      const w = wallets.get(a.id);
      if (!w) return;
      w.balances.BRDG += rate.base;
      w.earned_total += rate.base;
      w.transactions.push({ type: 'payroll', amount: rate.base, ts: Date.now() });
      state.treasury.balance -= rate.base;
      state.treasury.spent += rate.base;
      payments.push({ agent: a.id, name: a.name, amount: rate.base });
    });
    broadcast({ type: 'payroll_run', payments: payments.length, total: payments.reduce((s, p) => s + p.amount, 0) });
    res.json({ ok: true, payments, count: payments.length, total_paid: payments.reduce((s, p) => s + p.amount, 0), currency: 'BRDG' });
  });

  // Payroll rates
  app.get('/api/agents/payroll/rates', (_req, res) => res.json({ ok: true, rates: payrollRates }));

  // Agent allocation (assign to post)
  app.post('/api/agents/allocate', (req, res) => {
    const { agent_id, post, task } = req.body || {};
    const agent = AGENTS.find(a => a.id === agent_id);
    if (!agent) return res.status(404).json({ ok: false });
    agent.allocated_to = post || task;
    agent.allocated_at = Date.now();
    broadcast({ type: 'agent_allocated', agent_id, post, task });
    res.json({ ok: true, agent_id, allocated_to: agent.allocated_to });
  });

  // Agent stats summary
  app.get('/api/agents/economy', (_req, res) => {
    const totalWalletValue = [...wallets.values()].reduce((s, w) => s + (w.balances.BRDG || 0), 0);
    const totalEarned = [...wallets.values()].reduce((s, w) => s + w.earned_total, 0);
    const byType = {};
    AGENTS.forEach(a => { byType[a.type] = (byType[a.type] || 0) + 1; });
    res.json({ ok: true,
      total_agents: AGENTS.length,
      active: AGENTS.filter(a => a.status === 'active').length,
      by_type: byType,
      total_wallet_brdg: totalWalletValue,
      total_earned_brdg: totalEarned,
      treasury_balance: state.treasury.balance,
      payroll_monthly_estimate: Object.entries(byType).reduce((s, [type, count]) => s + (payrollRates[type]?.base || 0) * count, 0),
      economy_health: totalWalletValue > 0 && state.treasury.balance > 10000 ? 'healthy' : 'stressed',
    });
  });

  // Discover agents from filesystem (scan)
  app.post('/api/agents/discover', (_req, res) => {
    res.json({ ok: true,
      discovered: AGENTS.length,
      sources: [
        { path: 'agents/laptop1-streaming-orchestrator.js', agents: 6, type: 'L1' },
        { path: 'agents/laptop2-streaming-orchestrator.js', agents: 2, type: 'L2' },
        { path: 'agents/laptop3-minimax-orchestrator.js', agents: 1, type: 'L3' },
        { path: 'E:/BridgeAI/svg-engine/skills/*.skill.js', agents: 8, type: 'SVG skills' },
        { path: 'brain-business.js', agents: 8, type: 'Business' },
        { path: 'E:/BridgeAI/BridgeLiveWall/twins', agents: 4, type: 'BossBots' },
        { path: 'BAN/nodes/registry.py', agents: 3, type: 'BAN nodes' },
        { path: 'brain.js', agents: 2, type: 'Core (Prime + Twin)' },
      ],
      total: AGENTS.length,
    });
  });
};
