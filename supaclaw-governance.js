// =============================================================================
// SUPACLAW SWARM ECONOMY GOVERNANCE ENGINE
// Nation-scale parallel execution + tiered agents + governance + market dynamics
// =============================================================================

const TIERS = ['JUNIOR', 'OPERATOR', 'SPECIALIST', 'EXPERT', 'GURU'];
const TIER_CONFIG = {
  JUNIOR:     { task_types: ['low_risk'], capital_access: 0.05, governance_weight: 0.1, promo_threshold: 50 },
  OPERATOR:   { task_types: ['standard', 'low_risk'], capital_access: 0.15, governance_weight: 0.3, promo_threshold: 150 },
  SPECIALIST: { task_types: ['domain', 'standard'], capital_access: 0.30, governance_weight: 0.5, promo_threshold: 400 },
  EXPERT:     { task_types: ['optimization', 'strategy', 'domain'], capital_access: 0.60, governance_weight: 0.8, promo_threshold: 1000 },
  GURU:       { task_types: ['*'], capital_access: 1.0, governance_weight: 1.0, promo_threshold: Infinity },
};

// ── SWARM AGENTS (tiered) ───────────────────────────────────────────────────
const swarmAgents = [];
function seedSwarm() {
  const names = [
    ['alpha','orchestrator','GURU'], ['beta','verifier','EXPERT'], ['gamma','executor','SPECIALIST'],
    ['delta','optimizer','EXPERT'], ['epsilon','scanner','OPERATOR'], ['zeta','guardian','GURU'],
    ['eta','trader','SPECIALIST'], ['theta','teacher','EXPERT'],
    // Junior pool
    ['lambda','apprentice','JUNIOR'], ['mu','trainee','JUNIOR'], ['nu','intern','JUNIOR'],
    ['xi','cadet','JUNIOR'], ['omicron','recruit','JUNIOR'],
    // Operator pool
    ['pi','worker','OPERATOR'], ['rho','runner','OPERATOR'], ['sigma','processor','OPERATOR'],
    // Specialist pool
    ['tau','analyst','SPECIALIST'], ['upsilon','researcher','SPECIALIST'],
    // Additional experts
    ['phi','strategist','EXPERT'], ['chi','architect','EXPERT'],
  ];
  names.forEach(([id, role, tier]) => {
    swarmAgents.push({
      id: `swarm-${id}`, name: id.charAt(0).toUpperCase() + id.slice(1), role, tier,
      reputation: tier === 'GURU' ? 95 : tier === 'EXPERT' ? 80 : tier === 'SPECIALIST' ? 65 : tier === 'OPERATOR' ? 50 : 30,
      tasks_completed: 0, revenue_generated: 0, accuracy: 0.90,
      efficiency: 0.80, stake: 0, status: 'active',
    });
  });
}
seedSwarm();

// ── SWARM CLUSTERS ──────────────────────────────────────────────────────────
const clusters = [
  { id: 'cluster-trade', name: 'Trading Swarm', agents: ['eta', 'tau', 'phi'], mode: 'parallel', tasks: 0, revenue: 0 },
  { id: 'cluster-biz', name: 'Business Swarm', agents: ['gamma', 'pi', 'rho', 'sigma'], mode: 'parallel', tasks: 0, revenue: 0 },
  { id: 'cluster-ops', name: 'Operations Swarm', agents: ['delta', 'epsilon', 'upsilon'], mode: 'pipeline', tasks: 0, revenue: 0 },
  { id: 'cluster-gov', name: 'Governance Swarm', agents: ['alpha', 'beta', 'zeta'], mode: 'consensus', tasks: 0, revenue: 0 },
  { id: 'cluster-learn', name: 'Learning Swarm', agents: ['theta', 'chi', 'nu'], mode: 'feedback', tasks: 0, revenue: 0 },
];

// ── GOVERNANCE ──────────────────────────────────────────────────────────────
const proposals = [];
const auditLedger = [];
const policies = [
  { id: 'pol-tax', name: 'Dynamic Taxation', rule: 'All value taxed before distribution', status: 'enforced' },
  { id: 'pol-tier', name: 'Tier Membership', rule: 'All agents must belong to a tier', status: 'enforced' },
  { id: 'pol-audit', name: 'Audit Trail', rule: 'All actions recorded in ledger', status: 'enforced' },
  { id: 'pol-valid', name: 'Execution Validation', rule: 'No execution without verification', status: 'enforced' },
  { id: 'pol-scale', name: 'Horizontal Scale', rule: 'System must always scale horizontally', status: 'enforced' },
];

// ── TASK MARKET ─────────────────────────────────────────────────────────────
const taskMarket = { posted: 0, completed: 0, total_value: 0, avg_price: 0, active_auctions: 0 };

function computePrice(demand, complexity, urgency) {
  return +(demand * complexity * urgency).toFixed(4);
}

// ── PROGRESSION ─────────────────────────────────────────────────────────────
function checkPromotion(agent) {
  const tierIdx = TIERS.indexOf(agent.tier);
  if (tierIdx >= TIERS.length - 1) return; // Already GURU
  const config = TIER_CONFIG[agent.tier];
  if (agent.tasks_completed >= config.promo_threshold && agent.accuracy > 0.8 && agent.efficiency > 0.7) {
    agent.tier = TIERS[tierIdx + 1];
    agent.reputation = Math.min(100, agent.reputation + 10);
    auditLedger.push({ type: 'promotion', agent: agent.id, from: TIERS[tierIdx], to: agent.tier, ts: Date.now() });
  }
}

function checkDemotion(agent) {
  const tierIdx = TIERS.indexOf(agent.tier);
  if (tierIdx <= 0) return;
  if (agent.accuracy < 0.5 || agent.efficiency < 0.3) {
    agent.tier = TIERS[tierIdx - 1];
    agent.reputation = Math.max(0, agent.reputation - 15);
    auditLedger.push({ type: 'demotion', agent: agent.id, to: agent.tier, ts: Date.now() });
  }
}

// ── MAIN LOOPS ──────────────────────────────────────────────────────────────
const govTaskQueue = []; // Real tasks submitted via API
let govCycle = 0;
let govActive = true;

function swarmEconomyLoop(state, broadcast) {
  if (!govActive) return;
  govCycle++;

  // Process only real tasks from the governance task queue — no simulated throughput.
  const pendingGovTasks = govTaskQueue.splice(0, 15);
  const numTasks = pendingGovTasks.length;
  let cycleRevenue = 0, cycleTax = 0;

  for (const task of pendingGovTasks) {
    const price = computePrice(task.demand || 0.5, task.complexity || 0.5, task.urgency || 0.5);

    // Assign to appropriate cluster based on task type
    const clusterMap = { trade: 0, business: 1, ops: 2, governance: 3, learning: 4 };
    const cluster = clusters[clusterMap[task.type] || 0] || clusters[0];
    cluster.tasks++;

    // Pick first available agent from cluster
    const agentId = cluster.agents[0];
    const agent = swarmAgents.find(a => a.id === `swarm-${agentId}`) || swarmAgents[0];

    // Real execution result
    agent.tasks_completed++;
    agent.revenue_generated += price;
    cluster.revenue += price;
    cycleRevenue += price;
    taskMarket.completed++;
    taskMarket.posted++;
  }

  taskMarket.total_value += cycleRevenue;
  taskMarket.avg_price = taskMarket.total_value / Math.max(1, taskMarket.completed);

  // Fixed tax rate: 15%
  const taxRate = 0.15;
  cycleTax = cycleRevenue * taxRate;
  const net = cycleRevenue - cycleTax;

  if (net > 0) {
    state.treasury.balance += net;
    state.treasury.earned += net;
  }

  // Check promotions/demotions based on actual performance
  swarmAgents.forEach(a => {
    checkPromotion(a);
    checkDemotion(a);
  });

  // Governance proposals are submitted via API, not auto-generated
  if (auditLedger.length > 500) auditLedger.splice(0, auditLedger.length - 500);

  if (broadcast && numTasks > 0) {
    broadcast({ type: 'governance_cycle', cycle: govCycle, tasks: numTasks, revenue: +cycleRevenue.toFixed(2), tax: +cycleTax.toFixed(2), agents: swarmAgents.length });
  }
}

// ── REGISTER ROUTES ─────────────────────────────────────────────────────────
module.exports = function registerGovernance(app, state, broadcast) {

  setInterval(() => { try { swarmEconomyLoop(state, broadcast); } catch (e) { console.error('[GOV]', e.message); } }, 11000); // 11s
  console.log('[GOV] Swarm economy + governance engine started (11s)');

  // Dashboard
  app.get('/api/governance/dashboard', (_req, res) => {
    const byTier = {};
    TIERS.forEach(t => { byTier[t] = swarmAgents.filter(a => a.tier === t).length; });
    const totalRev = swarmAgents.reduce((s, a) => s + a.revenue_generated, 0);
    const totalTasks = swarmAgents.reduce((s, a) => s + a.tasks_completed, 0);
    res.json({ ok: true,
      cycle: govCycle, active: govActive,
      agents: { total: swarmAgents.length, by_tier: byTier },
      clusters: clusters.map(c => ({ id: c.id, name: c.name, mode: c.mode, tasks: c.tasks, revenue: +c.revenue.toFixed(2) })),
      market: taskMarket,
      economy: { total_revenue: +totalRev.toFixed(2), total_tasks: totalTasks, treasury: +state.treasury.balance.toFixed(2) },
      governance: { proposals: proposals.length, policies: policies.length, audit_entries: auditLedger.length },
      tax_distribution: { founders: '25%', operations: '25%', infra: '20%', reserve: '15%', ubi: '15%' },
    });
  });

  // Agents by tier
  app.get('/api/governance/agents', (_req, res) => res.json({ ok: true,
    agents: swarmAgents.map(a => ({ ...a, revenue_generated: +a.revenue_generated.toFixed(2), accuracy: +a.accuracy.toFixed(3), efficiency: +a.efficiency.toFixed(3) })),
    tiers: TIER_CONFIG,
  }));

  // Clusters
  app.get('/api/governance/clusters', (_req, res) => res.json({ ok: true, clusters }));

  // Proposals
  app.get('/api/governance/proposals', (_req, res) => res.json({ ok: true, proposals: proposals.slice(-20), total: proposals.length }));

  // Submit proposal
  app.post('/api/governance/propose', (req, res) => {
    const { title, type } = req.body || {};
    const p = { id: `prop-${Date.now()}`, title: title || 'Untitled', type: type || 'general', votes_for: 0, votes_against: 0, status: 'pending', ts: Date.now() };
    proposals.push(p);
    res.json({ ok: true, proposal: p });
  });

  // Vote
  app.post('/api/governance/vote', (req, res) => {
    const { proposal_id, vote, agent_id } = req.body || {};
    const p = proposals.find(pr => pr.id === proposal_id);
    if (!p) return res.status(404).json({ ok: false });
    const agent = swarmAgents.find(a => a.id === agent_id);
    const weight = agent ? TIER_CONFIG[agent.tier].governance_weight : 0.1;
    if (vote === 'for') p.votes_for += weight; else p.votes_against += weight;
    if (p.votes_for + p.votes_against >= 3) p.status = p.votes_for > p.votes_against ? 'approved' : 'rejected';
    res.json({ ok: true, proposal: p });
  });

  // Policies
  app.get('/api/governance/policies', (_req, res) => res.json({ ok: true, policies }));

  // Audit ledger
  app.get('/api/governance/audit', (_req, res) => res.json({ ok: true, entries: auditLedger.slice(-30), total: auditLedger.length }));

  // Reputation leaderboard
  app.get('/api/governance/leaderboard', (_req, res) => {
    const sorted = [...swarmAgents].sort((a, b) => b.reputation - a.reputation);
    res.json({ ok: true, leaderboard: sorted.map((a, i) => ({ rank: i + 1, id: a.id, name: a.name, tier: a.tier, reputation: +a.reputation.toFixed(1), tasks: a.tasks_completed, revenue: +a.revenue_generated.toFixed(2) })) });
  });

  // Market
  app.get('/api/governance/market', (_req, res) => res.json({ ok: true, ...taskMarket, avg_price: +taskMarket.avg_price.toFixed(4) }));

  // Progression rules
  app.get('/api/governance/progression', (_req, res) => res.json({ ok: true, tiers: TIERS, config: TIER_CONFIG, current_distribution: Object.fromEntries(TIERS.map(t => [t, swarmAgents.filter(a => a.tier === t).length])) }));

  // Control
  app.post('/api/governance/pause', (_req, res) => { govActive = false; res.json({ ok: true }); });
  app.post('/api/governance/resume', (_req, res) => { govActive = true; res.json({ ok: true }); });
};
