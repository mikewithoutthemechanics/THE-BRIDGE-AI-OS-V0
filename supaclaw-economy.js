// =============================================================================
// SUPACLAW COMPOUND ECONOMY ENGINE
// Revenue engines + TPS control + FinTech bank + Liquidity compounding
// =============================================================================
const crypto = require('crypto');

// ── SHADOW ACCOUNTS (virtual bank for every agent/user) ─────────────────────
const shadowAccounts = new Map();
function getAccount(id) {
  if (!shadowAccounts.has(id)) {
    shadowAccounts.set(id, { id, balance: 0, earned: 0, spent: 0, tax_paid: 0, transactions: [], created: Date.now() });
  }
  return shadowAccounts.get(id);
}

// ── TPS CONTROLLER ──────────────────────────────────────────────────────────
const tps = {
  current: 0,
  target: 50,
  max: 200,
  window_ms: 1000,
  tasks_this_window: 0,
  window_start: Date.now(),
  total_tasks: 0,
  total_revenue: 0,
  total_cost: 0,
  rejected_unprofitable: 0,
  throttled: 0,
};

// ── COST/TIME PER TASK ──────────────────────────────────────────────────────
const taskMetrics = {
  avg_cost: 0.12,
  avg_time_ms: 45,
  avg_profit: 0.88,
  min_profit_threshold: 0.05,
  cost_threshold: 5.0,
  time_threshold_ms: 500,
  history: [],
};

// ── SYSTEM TAX ENGINE ───────────────────────────────────────────────────────
function computeTaxRate(treasuryHealth, systemLoad, profitability) {
  // Dynamic 5% → 30% based on system state
  let rate = 0.10; // base 10%
  if (treasuryHealth < 0.3) rate = 0.05; // low treasury = low tax to encourage growth
  if (treasuryHealth > 0.7 && profitability > 0.5) rate = 0.20; // healthy = higher tax
  if (systemLoad > 0.9) rate = Math.min(0.30, rate + 0.10); // high load = surge tax
  return Math.max(0.05, Math.min(0.30, rate));
}

const taxPool = { founders: 0, operations: 0, reserve: 0, expansion: 0, total_collected: 0, rate_history: [] };

// ── LIQUIDITY ENGINE ────────────────────────────────────────────────────────
const liquidity = {
  pool_balance: 0,
  deployed: { market_making: 0, arbitrage: 0, staking: 0, lending: 0 },
  yield_earned: 0,
  compound_cycles: 0,
  apy_estimate: 0.12,
};

// ── SETTLEMENT ENGINE ───────────────────────────────────────────────────────
const settlements = { pending: [], completed: [], batched: 0, total_settled: 0 };

// ── ACCUMULATION TRACKER ────────────────────────────────────────────────────
const accumulation = { total_in: 0, total_out: 0, net: 0, peak: 0, growth_rate: 0, snapshots: [] };

let econCycle = 0;
let econActive = true;

// ── ECONOMY LOOP ────────────────────────────────────────────────────────────
function economyLoop(state, broadcast) {
  if (!econActive) return;
  econCycle++;
  const t0 = Date.now();

  // Reset TPS window
  if (Date.now() - tps.window_start > tps.window_ms) {
    tps.current = tps.tasks_this_window;
    tps.tasks_this_window = 0;
    tps.window_start = Date.now();
  }

  // Simulate task stream (3-8 tasks per cycle)
  const numTasks = Math.floor(Math.random() * 6) + 3;
  let cycleRevenue = 0, cycleCost = 0, cycleTax = 0;

  for (let i = 0; i < numTasks; i++) {
    const taskCost = +(Math.random() * 0.5 + 0.05).toFixed(4);
    const taskTime = Math.floor(Math.random() * 100 + 10);
    const taskPrice = +(taskCost + Math.random() * 2 + 0.1).toFixed(4);
    const taskProfit = taskPrice - taskCost;

    // TPS control
    if (tps.tasks_this_window >= tps.target) { tps.throttled++; continue; }

    // Profitability gate
    if (taskProfit < taskMetrics.min_profit_threshold) { tps.rejected_unprofitable++; continue; }

    // Cost gate
    if (taskCost > taskMetrics.cost_threshold) { tps.rejected_unprofitable++; continue; }

    // Time gate (simulated)
    if (taskTime > taskMetrics.time_threshold_ms) continue;

    // EXECUTE
    tps.tasks_this_window++;
    tps.total_tasks++;

    cycleRevenue += taskPrice;
    cycleCost += taskCost;

    // Track metrics
    taskMetrics.history.push({ cost: taskCost, time: taskTime, profit: taskProfit, ts: Date.now() });
    if (taskMetrics.history.length > 200) taskMetrics.history.shift();
  }

  const grossProfit = cycleRevenue - cycleCost;
  tps.total_revenue += cycleRevenue;
  tps.total_cost += cycleCost;

  // SYSTEM TAX
  const treasuryHealth = state.treasury.balance > 100000 ? 0.8 : state.treasury.balance > 50000 ? 0.5 : 0.2;
  const systemLoad = tps.current / tps.target;
  const profitability = grossProfit > 0 ? Math.min(1, grossProfit / cycleRevenue) : 0;
  const taxRate = computeTaxRate(treasuryHealth, systemLoad, profitability);
  cycleTax = grossProfit * taxRate;
  const netValue = grossProfit - cycleTax;

  taxPool.rate_history.push(taxRate);
  if (taxPool.rate_history.length > 50) taxPool.rate_history.shift();

  // TAX DISTRIBUTION: 40% founders / 30% ops / 20% reserve / 10% expansion
  if (cycleTax > 0) {
    taxPool.founders += cycleTax * 0.40;
    taxPool.operations += cycleTax * 0.30;
    taxPool.reserve += cycleTax * 0.20;
    taxPool.expansion += cycleTax * 0.10;
    taxPool.total_collected += cycleTax;
  }

  // TREASURY DEPOSIT
  if (netValue > 0) {
    state.treasury.balance += netValue;
    state.treasury.earned += netValue;
    accumulation.total_in += netValue;
  }

  // LIQUIDITY COMPOUND
  liquidity.pool_balance += netValue * 0.3; // 30% to liquidity pool
  const yieldThisCycle = liquidity.pool_balance * (liquidity.apy_estimate / (365 * 24 * 60 / 0.15)); // per 9s cycle
  liquidity.yield_earned += yieldThisCycle;
  liquidity.pool_balance += yieldThisCycle;
  liquidity.compound_cycles++;

  // Deploy liquidity
  const deployable = liquidity.pool_balance * 0.8;
  liquidity.deployed.market_making = deployable * 0.35;
  liquidity.deployed.arbitrage = deployable * 0.25;
  liquidity.deployed.staking = deployable * 0.25;
  liquidity.deployed.lending = deployable * 0.15;

  // UBI from net value
  const ubiAmount = netValue * 0.15;

  // SETTLEMENT BATCH
  if (econCycle % 5 === 0 && (taxPool.founders > 0 || ubiAmount > 0)) {
    settlements.pending.push({
      id: `settle_${econCycle}`,
      founders: +taxPool.founders.toFixed(4),
      ops: +taxPool.operations.toFixed(4),
      ubi: +ubiAmount.toFixed(4),
      ts: Date.now(),
    });
    settlements.batched++;
  }

  // Process pending settlements
  while (settlements.pending.length > 0 && settlements.pending[0].ts < Date.now() - 10000) {
    const s = settlements.pending.shift();
    settlements.completed.push(s);
    settlements.total_settled += (s.founders || 0) + (s.ops || 0) + (s.ubi || 0);
    if (settlements.completed.length > 50) settlements.completed.shift();
  }

  // ACCUMULATION SNAPSHOT
  accumulation.net = accumulation.total_in - accumulation.total_out;
  if (accumulation.net > accumulation.peak) accumulation.peak = accumulation.net;
  if (econCycle % 10 === 0) {
    accumulation.snapshots.push({ cycle: econCycle, net: +accumulation.net.toFixed(2), treasury: +state.treasury.balance.toFixed(2), liquidity: +liquidity.pool_balance.toFixed(2), ts: Date.now() });
    if (accumulation.snapshots.length > 50) accumulation.snapshots.shift();
  }

  // Update avg metrics
  if (taskMetrics.history.length > 0) {
    const recent = taskMetrics.history.slice(-50);
    taskMetrics.avg_cost = +(recent.reduce((s, t) => s + t.cost, 0) / recent.length).toFixed(4);
    taskMetrics.avg_time_ms = Math.round(recent.reduce((s, t) => s + t.time, 0) / recent.length);
    taskMetrics.avg_profit = +(recent.reduce((s, t) => s + t.profit, 0) / recent.length).toFixed(4);
  }

  if (broadcast) {
    broadcast({ type: 'economy_cycle', cycle: econCycle, revenue: +cycleRevenue.toFixed(4), tax: +cycleTax.toFixed(4), net: +netValue.toFixed(4), tps: tps.current, treasury: +state.treasury.balance.toFixed(2) });
  }
}

// ── REGISTER ROUTES ─────────────────────────────────────────────────────────
module.exports = function registerEconomyEngine(app, state, broadcast) {

  setInterval(() => {
    try { economyLoop(state, broadcast); } catch (e) { console.error('[ECON] Loop error:', e.message); }
  }, 9000); // 9s interval (offset from 5s supaclaw + 7s abaas)
  console.log('[ECON] Compound economy engine started (9s interval)');

  // Dashboard
  app.get('/api/economy/dashboard', (_req, res) => {
    const avgTax = taxPool.rate_history.length ? (taxPool.rate_history.reduce((a, b) => a + b) / taxPool.rate_history.length) : 0.10;
    res.json({ ok: true,
      cycle: econCycle, active: econActive,
      tps: { current: tps.current, target: tps.target, total_tasks: tps.total_tasks, throttled: tps.throttled, rejected: tps.rejected_unprofitable },
      task_metrics: { avg_cost: taskMetrics.avg_cost, avg_time_ms: taskMetrics.avg_time_ms, avg_profit: taskMetrics.avg_profit },
      revenue: { total: +tps.total_revenue.toFixed(2), total_cost: +tps.total_cost.toFixed(2), gross_profit: +(tps.total_revenue - tps.total_cost).toFixed(2) },
      tax: { ...taxPool, total_collected: +taxPool.total_collected.toFixed(2), avg_rate: +(avgTax * 100).toFixed(1) + '%', distribution: '40% founders / 30% ops / 20% reserve / 10% expansion' },
      liquidity: { pool: +liquidity.pool_balance.toFixed(2), deployed: Object.fromEntries(Object.entries(liquidity.deployed).map(([k, v]) => [k, +v.toFixed(2)])), yield: +liquidity.yield_earned.toFixed(4), compounds: liquidity.compound_cycles, apy: (liquidity.apy_estimate * 100) + '%' },
      accumulation: { total_in: +accumulation.total_in.toFixed(2), net: +accumulation.net.toFixed(2), peak: +accumulation.peak.toFixed(2) },
      settlements: { pending: settlements.pending.length, completed: settlements.completed.length, total_settled: +settlements.total_settled.toFixed(2) },
      treasury: +state.treasury.balance.toFixed(2),
    });
  });

  // Shadow accounts
  app.get('/api/economy/accounts', (_req, res) => res.json({ ok: true, accounts: [...shadowAccounts.values()].map(a => ({ ...a, transactions: a.transactions.length })), count: shadowAccounts.size }));
  app.get('/api/economy/accounts/:id', (req, res) => {
    const a = getAccount(req.params.id);
    res.json({ ok: true, ...a });
  });
  app.post('/api/economy/accounts/:id/deposit', (req, res) => {
    const a = getAccount(req.params.id);
    const amt = parseFloat(req.body.amount) || 0;
    a.balance += amt; a.earned += amt;
    a.transactions.push({ type: 'deposit', amount: amt, ts: Date.now() });
    res.json({ ok: true, balance: a.balance });
  });
  app.post('/api/economy/accounts/:id/withdraw', (req, res) => {
    const a = getAccount(req.params.id);
    const amt = Math.min(a.balance, parseFloat(req.body.amount) || 0);
    a.balance -= amt; a.spent += amt;
    a.transactions.push({ type: 'withdraw', amount: amt, ts: Date.now() });
    res.json({ ok: true, balance: a.balance, withdrawn: amt });
  });

  // TPS
  app.get('/api/economy/tps', (_req, res) => res.json({ ok: true, ...tps }));
  app.put('/api/economy/tps/target', (req, res) => { tps.target = parseInt(req.body.target) || 50; res.json({ ok: true, target: tps.target }); });

  // Tax
  app.get('/api/economy/tax', (_req, res) => res.json({ ok: true, ...taxPool, avg_rate: taxPool.rate_history.length ? +(taxPool.rate_history.reduce((a, b) => a + b) / taxPool.rate_history.length * 100).toFixed(1) + '%' : '10%' }));

  // Liquidity
  app.get('/api/economy/liquidity', (_req, res) => res.json({ ok: true, ...liquidity, pool_balance: +liquidity.pool_balance.toFixed(2), yield_earned: +liquidity.yield_earned.toFixed(4) }));

  // Settlements
  app.get('/api/economy/settlements', (_req, res) => res.json({ ok: true, pending: settlements.pending, completed: settlements.completed.slice(-10), total: settlements.total_settled }));

  // Accumulation
  app.get('/api/economy/accumulation', (_req, res) => res.json({ ok: true, ...accumulation, snapshots: accumulation.snapshots.slice(-20) }));

  // Revenue model
  app.get('/api/economy/model', (_req, res) => res.json({ ok: true,
    sources: [
      { id: 'task_fees', formula: 'base_cost + (time * rate) + (compute * rate)', share: '60%' },
      { id: 'tps_throughput', formula: 'tasks_per_second * price_per_task', share: '15%' },
      { id: 'agent_marketplace', formula: 'lease_fee + (execution_fee * 0.15)', share: '10%' },
      { id: 'trading_profits', formula: 'quant_engines_pnl', share: '10%' },
      { id: 'fintech_fees', formula: 'transaction_fee + settlement_spread', share: '5%' },
    ],
    tax: { dynamic: '5% → 30%', based_on: ['treasury_health', 'system_load', 'profitability'] },
    tax_distribution: { founders: '40%', operations: '30%', reserve: '20%', expansion: '10%' },
    accumulation: 'ALL value → treasury → never idle → always compounding',
  }));

  // Control
  app.post('/api/economy/pause', (_req, res) => { econActive = false; res.json({ ok: true }); });
  app.post('/api/economy/resume', (_req, res) => { econActive = true; res.json({ ok: true }); });
};
