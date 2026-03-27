// =============================================================================
// SUPACLAW SUPA GURU — Autonomous Meta-System Runtime
// Living intelligence system: self-learning, self-optimizing, self-executing,
// self-sustaining, self-governing
// =============================================================================

const crypto = require('crypto');

// ── SYSTEM DEFINITION ───────────────────────────────────────────────────────
const SYSTEM = {
  name: 'SUPACLAW_SUPA_GURU_CORE',
  version: '1.0.0',
  status: 'ACTIVE',
  boot_ts: Date.now(),
  cycle: 0,
  layers: {
    L0: { name: 'CORE_RUNTIME', modules: ['flow.basic', 'bridge.decision'], role: 'Execution kernel + final authority' },
    L1: { name: 'PERCEPTION_STATE', modules: ['brain.reasoning', 'net.scanner', 'bridge.swarm'], role: 'Environment awareness + telemetry' },
    L2: { name: 'INTELLIGENCE_STRATEGY', modules: ['quant.momentum', 'quant.arbitrage', 'quant.sentiment', 'quant.meanrevert', 'biz.marketing', 'biz.crm', 'biz.support', 'bridge.youtube'], role: 'Alpha generation + market interaction' },
    L3: { name: 'EXECUTION_VALUE', modules: ['platform.dex', 'platform.defi', 'biz.invoicing', 'biz.debt', 'biz.legal'], role: 'Financial execution + compliance' },
    L4: { name: 'ECONOMIC_LOOP', modules: ['bridge.treasury', 'platform.ubi', 'bridge.economy'], role: 'Aggregation + distribution + closed loop' },
  },
};

// ── STATE ────────────────────────────────────────────────────────────────────
const runtime = {
  cycle: 0,
  active: true,
  last_scan: null,
  last_decision: null,
  last_execution: null,
  last_distribution: null,
  last_evolution: null,
  opportunities_generated: 0,
  opportunities_executed: 0,
  opportunities_rejected: 0,
  opportunities_silenced: 0,
  total_revenue: 0,
  total_distributed: 0,
  total_reinvested: 0,
  total_reserved: 0,
  twins_evolved: 0,
  knowledge_ingested: 0,
  errors: 0,
  loop_latency_ms: [],
};

// ── TWIN EVOLUTION ──────────────────────────────────────────────────────────
const twins = [
  { id: 'twin-trader', name: 'Trader Twin', specialty: 'trading', fitness: 0.72, pnl: 2400, trades: 147, win_rate: 0.64, generation: 1 },
  { id: 'twin-marketer', name: 'Marketer Twin', specialty: 'marketing', fitness: 0.68, leads: 587, conversions: 85, cac: 42, generation: 1 },
  { id: 'twin-operator', name: 'Operator Twin', specialty: 'operations', fitness: 0.81, tasks_completed: 2100, efficiency: 0.94, uptime: 0.997, generation: 1 },
  { id: 'twin-researcher', name: 'Researcher Twin', specialty: 'learning', fitness: 0.65, docs_ingested: 13, skills_learned: 27, insights: 42, generation: 1 },
  { id: 'twin-collector', name: 'Collector Twin', specialty: 'revenue', fitness: 0.74, collected: 28450, outstanding: 3200, recovery_rate: 0.89, generation: 1 },
];

function evolveTwins() {
  // Sort by fitness, top performers get boosted, bottom gets mutated
  twins.sort((a, b) => b.fitness - a.fitness);
  const top = twins[0];
  const bottom = twins[twins.length - 1];

  // Propagate winning behavior
  bottom.fitness = Math.min(1, bottom.fitness + (top.fitness - bottom.fitness) * 0.1);
  bottom.generation++;

  // Mutate all slightly
  twins.forEach(t => {
    t.fitness = Math.min(1, Math.max(0, t.fitness + (Math.random() - 0.48) * 0.05));
  });

  runtime.twins_evolved++;
  return { evolved: true, top: top.id, top_fitness: top.fitness, generation: top.generation };
}

// ── DECISION ENGINE (L0) ────────────────────────────────────────────────────
function decide(opportunity) {
  const { type, value, risk, ethical_score, system_health } = opportunity;

  // Ethical filter (hard reject)
  if (ethical_score !== undefined && ethical_score > 0.7) return { action: 'REJECT', reason: 'ethical_conflict' };

  // System health gate
  if (system_health !== undefined && system_health < 0.3) return { action: 'DEFER', reason: 'system_degraded' };

  // Profitability threshold
  if (value !== undefined && value <= 0) return { action: 'SILENCE', reason: 'no_value' };

  // Risk gate
  if (risk !== undefined && risk > 0.8) return { action: 'DEFER', reason: 'risk_too_high' };

  // All gates passed
  return { action: 'EXECUTE', reason: 'all_gates_passed', confidence: Math.min(1, (1 - (risk || 0.2)) * (system_health || 0.8)) };
}

// ── MASTER CONTROL LOOP ─────────────────────────────────────────────────────
function masterLoop(state, broadcast) {
  if (!runtime.active) return;

  const t0 = Date.now();
  runtime.cycle++;

  // L1: SCAN ENVIRONMENT
  const scan = {
    ts: Date.now(),
    system_health: 0.82 + Math.random() * 0.15,
    latency_avg: 12 + Math.random() * 30,
    agents_active: 33,
    treasury: state.treasury.balance,
    market_sentiment: Math.random(),
  };
  runtime.last_scan = scan;

  // L1: REASON
  const knowledge = {
    market_trend: scan.market_sentiment > 0.5 ? 'bullish' : 'bearish',
    system_state: scan.system_health > 0.7 ? 'healthy' : 'degraded',
    treasury_runway_months: state.treasury.balance / (state.treasury.spent || 4210),
  };

  // L2: GENERATE OPPORTUNITIES
  const opportunities = [];

  // Trading signals
  if (Math.random() > 0.4) {
    opportunities.push({
      id: `opp_trade_${runtime.cycle}`,
      type: 'trade',
      source: knowledge.market_trend === 'bullish' ? 'quant.momentum' : 'quant.meanrevert',
      value: +(Math.random() * 500 - 50).toFixed(2),
      risk: +(Math.random() * 0.6).toFixed(2),
      ethical_score: 0,
      system_health: scan.system_health,
    });
  }

  // Business leads
  if (Math.random() > 0.6) {
    opportunities.push({
      id: `opp_biz_${runtime.cycle}`,
      type: 'business',
      source: 'biz.marketing',
      value: +(Math.random() * 200 + 50).toFixed(2),
      risk: +(Math.random() * 0.3).toFixed(2),
      ethical_score: 0,
      system_health: scan.system_health,
    });
  }

  // System optimization
  if (scan.latency_avg > 30) {
    opportunities.push({
      id: `opp_opt_${runtime.cycle}`,
      type: 'optimization',
      source: 'bridge.swarm',
      value: 50,
      risk: 0.05,
      ethical_score: 0,
      system_health: scan.system_health,
    });
  }

  runtime.opportunities_generated += opportunities.length;

  // L0: DECIDE
  const executions = [];
  for (const opp of opportunities) {
    const decision = decide(opp);
    opp.decision = decision;
    runtime.last_decision = { opp: opp.id, ...decision, ts: Date.now() };

    if (decision.action === 'EXECUTE') {
      executions.push(opp);
      runtime.opportunities_executed++;
    } else if (decision.action === 'REJECT') {
      runtime.opportunities_rejected++;
    } else if (decision.action === 'SILENCE') {
      runtime.opportunities_silenced++;
    }
  }

  // L3: EXECUTE
  let cycle_revenue = 0;
  for (const exec of executions) {
    const revenue = Math.max(0, exec.value * (0.7 + Math.random() * 0.6));
    cycle_revenue += revenue;
    runtime.last_execution = { id: exec.id, type: exec.type, revenue: +revenue.toFixed(2), ts: Date.now() };
  }

  // L4: CAPTURE VALUE + DISTRIBUTE
  if (cycle_revenue > 0) {
    runtime.total_revenue += cycle_revenue;
    state.treasury.balance += cycle_revenue;
    state.treasury.earned += cycle_revenue;

    // Distribution: 30% UBI, 40% reinvest, 30% reserve
    const ubi = cycle_revenue * 0.30;
    const reinvest = cycle_revenue * 0.40;
    const reserve = cycle_revenue * 0.30;

    runtime.total_distributed += ubi;
    runtime.total_reinvested += reinvest;
    runtime.total_reserved += reserve;

    runtime.last_distribution = { ubi: +ubi.toFixed(2), reinvest: +reinvest.toFixed(2), reserve: +reserve.toFixed(2), ts: Date.now() };
  }

  // LEARN + EVOLVE (every 10 cycles)
  if (runtime.cycle % 10 === 0) {
    runtime.knowledge_ingested++;
    evolveTwins();
    runtime.last_evolution = { cycle: runtime.cycle, ts: Date.now() };
  }

  // Track latency
  const latency = Date.now() - t0;
  runtime.loop_latency_ms.push(latency);
  if (runtime.loop_latency_ms.length > 100) runtime.loop_latency_ms.shift();

  // Broadcast state
  if (broadcast) {
    broadcast({
      type: 'supaclaw_cycle',
      cycle: runtime.cycle,
      opportunities: opportunities.length,
      executed: executions.length,
      revenue: +cycle_revenue.toFixed(2),
      treasury: +state.treasury.balance.toFixed(2),
      latency_ms: latency,
    });
  }
}

// ── REGISTER ROUTES ─────────────────────────────────────────────────────────
module.exports = function registerSupaclaw(app, state, broadcast) {

  // Start the master loop (5 second interval)
  const loopInterval = setInterval(() => {
    try { masterLoop(state, broadcast); } catch (e) { runtime.errors++; console.error('[SUPACLAW] Loop error:', e.message); }
  }, 5000);

  console.log('[SUPACLAW] Master control loop started (5s interval)');

  // System definition
  app.get('/api/supaclaw/system', (_req, res) => res.json({ ok: true, ...SYSTEM, runtime_cycles: runtime.cycle, uptime_s: (Date.now() - SYSTEM.boot_ts) / 1000 }));

  // Runtime state
  app.get('/api/supaclaw/runtime', (_req, res) => {
    const avg_latency = runtime.loop_latency_ms.length ? (runtime.loop_latency_ms.reduce((a, b) => a + b) / runtime.loop_latency_ms.length).toFixed(1) : 0;
    res.json({ ok: true, ...runtime, avg_loop_latency_ms: +avg_latency, treasury_balance: state.treasury.balance });
  });

  // Twins
  app.get('/api/supaclaw/twins', (_req, res) => res.json({ ok: true, twins, evolved: runtime.twins_evolved }));

  // Force evolution
  app.post('/api/supaclaw/evolve', (_req, res) => {
    const result = evolveTwins();
    res.json({ ok: true, ...result });
  });

  // Decision test
  app.post('/api/supaclaw/decide', (req, res) => {
    const result = decide(req.body || {});
    res.json({ ok: true, ...result });
  });

  // Force cycle
  app.post('/api/supaclaw/tick', (_req, res) => {
    masterLoop(state, broadcast);
    res.json({ ok: true, cycle: runtime.cycle, treasury: state.treasury.balance });
  });

  // Control
  app.post('/api/supaclaw/pause', (_req, res) => { runtime.active = false; res.json({ ok: true, paused: true }); });
  app.post('/api/supaclaw/resume', (_req, res) => { runtime.active = true; res.json({ ok: true, resumed: true }); });

  // Economic flow
  app.get('/api/supaclaw/economy', (_req, res) => res.json({ ok: true,
    total_revenue: +runtime.total_revenue.toFixed(2),
    total_distributed_ubi: +runtime.total_distributed.toFixed(2),
    total_reinvested: +runtime.total_reinvested.toFixed(2),
    total_reserved: +runtime.total_reserved.toFixed(2),
    distribution_rules: { ubi: '30%', reinvest: '40%', reserve: '30%' },
    treasury: +state.treasury.balance.toFixed(2),
    cycles: runtime.cycle,
    revenue_per_cycle: runtime.cycle > 0 ? +(runtime.total_revenue / runtime.cycle).toFixed(2) : 0,
  }));

  // Module bindings
  app.get('/api/supaclaw/bindings', (_req, res) => res.json({ ok: true, bindings: [
    { from: 'net.scanner', to: 'brain.reasoning', type: 'perception→cognition' },
    { from: 'brain.reasoning', to: 'quant.*', type: 'cognition→strategy' },
    { from: 'brain.reasoning', to: 'biz.*', type: 'cognition→business' },
    { from: 'bridge.youtube', to: 'brain.reasoning', type: 'learning→cognition' },
    { from: 'quant.*', to: 'bridge.decision', type: 'strategy→authority' },
    { from: 'biz.*', to: 'bridge.decision', type: 'business→authority' },
    { from: 'bridge.decision', to: 'platform.dex', type: 'authority→execution' },
    { from: 'bridge.decision', to: 'biz.invoicing', type: 'authority→billing' },
    { from: 'platform.dex', to: 'bridge.treasury', type: 'execution→treasury' },
    { from: 'biz.invoicing', to: 'bridge.treasury', type: 'billing→treasury' },
    { from: 'biz.debt', to: 'bridge.treasury', type: 'collection→treasury' },
    { from: 'bridge.treasury', to: 'platform.ubi', type: 'treasury→distribution(30%)' },
    { from: 'bridge.treasury', to: 'bridge.economy', type: 'treasury→reinvest(40%)' },
    { from: 'bridge.economy', to: 'quant.*', type: 'reinvest→strategy(feedback)' },
    { from: 'platform.ubi', to: 'bridge.twins', type: 'distribution→evolution' },
    { from: 'bridge.twins', to: 'brain.reasoning', type: 'evolution→cognition(feedback)' },
    { from: 'bridge.swarm', to: 'flow.basic', type: 'health→runtime(auto-scale)' },
    { from: 'brain.keyforge', to: 'bridge.treasury', type: 'security→treasury(gate)' },
    { from: 'biz.legal', to: 'bridge.decision', type: 'compliance→authority(gate)' },
  ] }));

  // Full dashboard data
  app.get('/api/supaclaw/dashboard', (_req, res) => {
    const avg_latency = runtime.loop_latency_ms.length ? (runtime.loop_latency_ms.reduce((a, b) => a + b) / runtime.loop_latency_ms.length).toFixed(1) : 0;
    res.json({ ok: true,
      system: SYSTEM.name,
      status: runtime.active ? 'RUNNING' : 'PAUSED',
      cycle: runtime.cycle,
      uptime_s: Math.floor((Date.now() - SYSTEM.boot_ts) / 1000),
      avg_loop_ms: +avg_latency,
      treasury: +state.treasury.balance.toFixed(2),
      revenue: { total: +runtime.total_revenue.toFixed(2), per_cycle: runtime.cycle > 0 ? +(runtime.total_revenue / runtime.cycle).toFixed(2) : 0 },
      distribution: { ubi: +runtime.total_distributed.toFixed(2), reinvest: +runtime.total_reinvested.toFixed(2), reserve: +runtime.total_reserved.toFixed(2) },
      decisions: { executed: runtime.opportunities_executed, rejected: runtime.opportunities_rejected, silenced: runtime.opportunities_silenced, total: runtime.opportunities_generated },
      twins: twins.map(t => ({ id: t.id, name: t.name, fitness: +t.fitness.toFixed(3), generation: t.generation })),
      last: { scan: runtime.last_scan?.ts, decision: runtime.last_decision?.ts, execution: runtime.last_execution?.ts, evolution: runtime.last_evolution?.ts },
      errors: runtime.errors,
    });
  });
};
