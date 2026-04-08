// =============================================================================
// SUPACLAW INTELLIGENCE LAYER (IL-0)
// Meta-layer: Cognitive Router + Opportunity Engine + Value Scoring +
// Monetization Orchestrator + Intelligence Ledger + Pricing Tiers
// =============================================================================

const crypto = require('crypto');

// ── PRICING TIERS ───────────────────────────────────────────────────────────
const TIERS = {
  FREE:       { id: 'free', name: 'Free', price: 0, agents: 2, tasks_mo: 100, visuals: 'basic', automation: false, api_calls: 500, support: 'community' },
  PRO:        { id: 'pro', name: 'Pro', price: 49, agents: 8, tasks_mo: -1, visuals: 'hd', automation: true, api_calls: 10000, support: 'email' },
  ENTERPRISE: { id: 'enterprise', name: 'Enterprise', price: 499, agents: -1, tasks_mo: -1, visuals: 'hd+animated', automation: true, api_calls: -1, support: 'dedicated', multi_tenant: true, custom_agents: true, compliance: true },
  PLATFORM:   { id: 'platform', name: 'Platform', price: 2499, agents: -1, tasks_mo: -1, visuals: 'full', automation: true, api_calls: -1, support: 'priority', white_label: true, reseller: true, marketplace_revenue_share: 0.70 },
};

// ── INTELLIGENCE LEDGER ─────────────────────────────────────────────────────
const ledger = { decisions: [], scores: [], billing_events: [], usage: [], total_revenue: 0, total_decisions: 0 };

// ── COGNITIVE ROUTER (CR-1) ─────────────────────────────────────────────────
function cognitiveRoute(context) {
  const { task_type, complexity, urgency, user_tier } = context;
  const agents = {
    trade: ['eta', 'quant.momentum', 'quant.arbitrage'],
    business: ['gamma', 'biz.crm', 'biz.marketing'],
    optimization: ['delta', 'vector', 'bridge.swarm'],
    learning: ['theta', 'brain.reasoning', 'bridge.youtube'],
    security: ['zeta', 'brain.keyforge', 'brain.mfa'],
    creation: ['architect', 'foundry', 'glyph'],
  };
  const pool = agents[task_type] || agents.business;
  const selected = pool[Math.floor(complexity * pool.length) % pool.length];
  const expectedValue = (1 - (complexity * 0.3)) * urgency * (user_tier === 'PLATFORM' ? 5 : user_tier === 'ENTERPRISE' ? 3 : 1);
  ledger.total_decisions++;
  return { agent: selected, action: task_type, expected_value: +expectedValue.toFixed(2), confidence: 0.85 };
}

// ── OPPORTUNITY ENGINE (OE-2) ───────────────────────────────────────────────
function scanOpportunities(systemState) {
  const opps = [];
  // Premium feature detection
  if (systemState.agents_active > 5) opps.push({ type: 'upsell', target: 'PRO→ENTERPRISE', value: 450, trigger: 'agent_count_exceeded' });
  if (systemState.api_calls > 8000) opps.push({ type: 'upsell', target: 'api_tier_upgrade', value: 200, trigger: 'api_limit_approaching' });
  // Automation opportunities
  opps.push({ type: 'automation', target: 'recurring_task', value: 50, trigger: 'pattern_detected' });
  return opps;
}

// ── VALUE SCORING ENGINE (VSE-3) ────────────────────────────────────────────
function scoreValue(action) {
  const { impact = 0.5, risk = 0.3, revenue = 0, cost = 0, user_value = 0.5 } = action;
  const score = (impact * 0.30) + ((1 - risk) * 0.20) + (revenue * 0.001 * 0.25) + (user_value * 0.15) - (cost * 0.001 * 0.10);
  const entry = { score: +Math.max(0, Math.min(1, score)).toFixed(4), ...action, ts: Date.now() };
  ledger.scores.push(entry);
  if (ledger.scores.length > 500) ledger.scores.shift();
  return entry;
}

// ── MONETIZATION ORCHESTRATOR (MO-4) ────────────────────────────────────────
function processBillingEvent(event) {
  const { type, user_id, tier, amount, description } = event;
  const entry = { id: `bill_${Date.now().toString(36)}`, type, user_id, tier, amount: amount || 0, description, ts: Date.now() };
  ledger.billing_events.push(entry);
  ledger.total_revenue += entry.amount;
  if (ledger.billing_events.length > 1000) ledger.billing_events.shift();
  return entry;
}

function recordUsage(user_id, resource, quantity) {
  const entry = { user_id, resource, quantity, ts: Date.now() };
  ledger.usage.push(entry);
  if (ledger.usage.length > 2000) ledger.usage.shift();
  return entry;
}

// ── INTELLIGENCE LOOP ───────────────────────────────────────────────────────
let ilCycle = 0;
function intelligenceLoop(state, broadcast) {
  ilCycle++;

  // Scan opportunities
  const opps = scanOpportunities({ agents_active: 33, api_calls: 0, treasury: state.treasury.balance });

  // Score each
  opps.forEach(opp => {
    const scored = scoreValue({ impact: 0.7, risk: 0.2, revenue: opp.value, cost: opp.value * 0.1, user_value: 0.8 });
    if (scored.score > 0.5) {
      // Route to execution
      const route = cognitiveRoute({ task_type: opp.type === 'marketplace' ? 'trade' : 'business', complexity: 0.5, urgency: 0.7, user_tier: 'PRO' });
      // Generate billing event
      if (opp.value > 0) {
        processBillingEvent({ type: opp.type, user_id: 'system', tier: 'PRO', amount: opp.value * 0.15, description: `${opp.type}: ${opp.target}` });
        state.treasury.balance += opp.value * 0.15;
        state.treasury.earned += opp.value * 0.15;
      }
    }
  });

  if (broadcast && ilCycle % 5 === 0) {
    broadcast({ type: 'intelligence_cycle', cycle: ilCycle, opportunities: opps.length, revenue: ledger.total_revenue });
  }
}

// ── REGISTER ROUTES ─────────────────────────────────────────────────────────
module.exports = function registerIntelligence(app, state, broadcast) {

  setInterval(() => { try { intelligenceLoop(state, broadcast); } catch (e) { console.error('[IL]', e.message); } }, 13000); // 13s
  console.log('[IL] Intelligence Layer active (13s cycle)');

  // Pricing tiers
  app.get('/api/pricing', (_req, res) => res.json({ ok: true, tiers: TIERS, currency: 'USD', billing: 'monthly' }));
  app.get('/api/pricing/:tier', (req, res) => {
    const t = TIERS[req.params.tier.toUpperCase()];
    if (!t) return res.status(404).json({ ok: false });
    res.json({ ok: true, ...t });
  });

  // Cognitive router
  app.post('/api/intelligence/route', (req, res) => {
    const result = cognitiveRoute(req.body || { task_type: 'business', complexity: 0.5, urgency: 0.7, user_tier: 'PRO' });
    res.json({ ok: true, ...result });
  });

  // Opportunity scan
  app.get('/api/intelligence/opportunities', (_req, res) => {
    const opps = scanOpportunities({ agents_active: 33, api_calls: 5000, treasury: state.treasury.balance });
    res.json({ ok: true, opportunities: opps, count: opps.length });
  });

  // Value scoring
  app.post('/api/intelligence/score', (req, res) => {
    const result = scoreValue(req.body || {});
    res.json({ ok: true, ...result });
  });

  // Billing
  app.post('/api/intelligence/billing', (req, res) => {
    const event = processBillingEvent(req.body || {});
    res.json({ ok: true, event });
  });
  app.get('/api/intelligence/billing/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json({ ok: true, events: ledger.billing_events.slice(-limit), total_revenue: +ledger.total_revenue.toFixed(2) });
  });

  // Usage tracking
  app.post('/api/intelligence/usage', (req, res) => {
    const { user_id, resource, quantity } = req.body || {};
    const entry = recordUsage(user_id || 'anon', resource || 'api_call', quantity || 1);
    res.json({ ok: true, entry });
  });

  // Ledger
  app.get('/api/intelligence/ledger', (_req, res) => res.json({ ok: true,
    total_decisions: ledger.total_decisions,
    total_revenue: +ledger.total_revenue.toFixed(2),
    scores: ledger.scores.length,
    billing_events: ledger.billing_events.length,
    usage_records: ledger.usage.length,
    cycle: ilCycle,
  }));

  // Full dashboard
  app.get('/api/intelligence/dashboard', (_req, res) => {
    const opps = scanOpportunities({ agents_active: 33, api_calls: 5000, treasury: state.treasury.balance });
    res.json({ ok: true,
      layer: 'IL-0',
      cycle: ilCycle,
      modules: {
        cognitive_router: { decisions: ledger.total_decisions, status: 'active' },
        opportunity_engine: { current: opps.length, status: 'scanning' },
        value_scoring: { scored: ledger.scores.length, avg: ledger.scores.length > 0 ? +(ledger.scores.slice(-20).reduce((s, e) => s + e.score, 0) / Math.min(20, ledger.scores.length)).toFixed(3) : 0 },
        monetization: { events: ledger.billing_events.length, revenue: +ledger.total_revenue.toFixed(2) },
        ledger: { usage: ledger.usage.length },
      },
      pricing: Object.values(TIERS).map(t => ({ id: t.id, name: t.name, price: t.price })),
      treasury: +state.treasury.balance.toFixed(2),
    });
  });

  // Loading screen config (Intelligence-driven)
  app.post('/api/intelligence/loading-screen', (req, res) => {
    const { route, userId, tenantId } = req.body || {};
    const layers = { '/': 'L0', '/onboarding.html': 'L0', '/marketplace.html': 'L1', '/ban': 'L1', '/avatar.html': 'L1', '/topology.html': 'L2', '/registry.html': 'L2', '/terminal.html': 'L3', '/control.html': 'L3' };
    const layer = layers[route] || 'L0';
    const themes = { L0: { id: 'cosmic_horizon', primary: '#4F46E5', accent: '#22D3EE', bg: '#020617' }, L1: { id: 'blueprint_grid', primary: '#0EA5E9', accent: '#38BDF8', bg: '#020617' }, L2: { id: 'telemetry_pulse', primary: '#22C55E', accent: '#A3E635', bg: '#020617' }, L3: { id: 'command_matrix', primary: '#F97316', accent: '#FDBA74', bg: '#111827' }, L4: { id: 'deep_core', primary: '#EC4899', accent: '#F472B6', bg: '#020617' }, L5: { id: 'grid_engine', primary: '#22C55E', accent: '#22D3EE', bg: '#020617' } };
    const theme = themes[layer] || themes.L0;
    const agentMap = { L0: ['horizon', 'foundry'], L1: ['forge', 'oracle'], L2: ['atlas', 'weaver', 'strata'], L3: ['oracle', 'vector', 'glyph'] };
    const agents = (agentMap[layer] || []).map(id => ({ id, active: true }));
    const tier = 'pro'; // TODO: resolve from userId
    res.json({ ok: true, layer, theme, context: { section: route, route, userTier: tier }, agents, visual: { type: 'svg', assetId: theme.id }, copy: { title: `Entering ${layer}...`, meta: `Layer ${layer}` }, monetization: { tier, upsellMessage: tier === 'free' ? 'Upgrade to Pro for full animations' : null } });
  });

  // Theme catalog
  app.get('/api/intelligence/themes', (_req, res) => res.json({ ok: true, themes: {
    L0: { id: 'cosmic_horizon', primary: '#4F46E5', accent: '#22D3EE', bg: '#020617', font: 'Inter, system-ui', motion: 'cubic-bezier(0.4, 0.0, 0.2, 1)', duration: '600ms' },
    L1: { id: 'blueprint_grid', primary: '#0EA5E9', accent: '#38BDF8', bg: '#020617', font: 'Inter, system-ui', motion: 'cubic-bezier(0.4, 0.0, 0.2, 1)', duration: '500ms' },
    L2: { id: 'telemetry_pulse', primary: '#22C55E', accent: '#A3E635', bg: '#020617', font: 'Inter, system-ui', motion: 'cubic-bezier(0.4, 0.0, 0.2, 1)', duration: '400ms' },
    L3: { id: 'command_matrix', primary: '#F97316', accent: '#FDBA74', bg: '#111827', font: 'Inter, system-ui', motion: 'cubic-bezier(0.4, 0.0, 0.2, 1)', duration: '300ms' },
    L4: { id: 'deep_core', primary: '#EC4899', accent: '#F472B6', bg: '#020617', font: 'Inter, system-ui', motion: 'cubic-bezier(0.4, 0.0, 0.2, 1)', duration: '500ms' },
    L5: { id: 'grid_engine', primary: '#22C55E', accent: '#22D3EE', bg: '#020617', font: 'Inter, system-ui', motion: 'cubic-bezier(0.4, 0.0, 0.2, 1)', duration: '400ms' },
  } }));

  // Business model
  app.get('/api/intelligence/model', (_req, res) => res.json({ ok: true,
    revenue_sources: [
      { source: 'subscriptions', model: 'recurring', tiers: 4, mrr_potential: '$0-$2499/user/mo' },
      { source: 'api_usage', model: 'metered', rate: '$0.001-$0.01/call' },
      { source: 'agent_marketplace', model: 'commission', rate: '15% platform fee' },
      { source: 'enterprise_licensing', model: 'annual', range: '$5,988-$29,988/yr' },
      { source: 'white_label', model: 'licensing', range: '$29,988+/yr' },
      { source: 'data_insights', model: 'package', range: '$99-$999/report' },
      { source: 'consulting', model: 'hourly', range: '$150-$500/hr' },
    ],
    cost_structure: { infra: '15%', development: '25%', operations: '10%', marketing: '15%', reserve: '20%', ubi: '15%' },
    unit_economics: { cac: 42, ltv: 1200, ltv_cac_ratio: 28.6, payback_months: 2.1 },
    projections: { year1_arr: 240000, year3_arr: 2400000, year5_arr: 12000000 },
  }));

  // Agent-Intelligence API contract
  app.get('/api/intelligence/contract', (_req, res) => res.json({ ok: true,
    version: '1.0.0',
    endpoints: {
      route: { method: 'POST', path: '/api/intelligence/route', input: '{task_type, complexity, urgency, user_tier}', output: '{agent, action, expected_value, confidence}' },
      score: { method: 'POST', path: '/api/intelligence/score', input: '{impact, risk, revenue, cost, user_value}', output: '{score}' },
      opportunities: { method: 'GET', path: '/api/intelligence/opportunities', output: '[{type, target, value, trigger}]' },
      billing: { method: 'POST', path: '/api/intelligence/billing', input: '{type, user_id, tier, amount}', output: '{event}' },
      usage: { method: 'POST', path: '/api/intelligence/usage', input: '{user_id, resource, quantity}', output: '{entry}' },
      pricing: { method: 'GET', path: '/api/pricing', output: '{tiers}' },
      dashboard: { method: 'GET', path: '/api/intelligence/dashboard', output: '{full_state}' },
      model: { method: 'GET', path: '/api/intelligence/model', output: '{business_model}' },
    },
    rules: [
      'All actions must be scored before execution',
      'All execution must generate billing events',
      'All usage must be tracked',
      'Pricing determines feature access',
      'Intelligence Layer has override authority on all agent actions',
    ],
  }));
};
