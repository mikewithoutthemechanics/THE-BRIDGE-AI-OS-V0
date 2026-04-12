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

const taskQueue = []; // Real tasks submitted via API, processed each cycle
let econCycle = 0;
let econActive = true;

// ── ECONOMY LOOP ────────────────────────────────────────────────────────────
// Async: treasury credit must await SQLite commit before loop continues (𝓛₁)
async function economyLoop(state, broadcast) {
  if (!econActive) return;
  econCycle++;
  const t0 = Date.now();

  // Reset TPS window
  if (Date.now() - tps.window_start > tps.window_ms) {
    tps.current = tps.tasks_this_window;
    tps.tasks_this_window = 0;
    tps.window_start = Date.now();
  }

  // Process only REAL tasks from the task queue — no simulated task stream.
  // Tasks are submitted via POST /api/tasks/submit and queued for processing.
  const pendingTasks = taskQueue.splice(0, Math.min(taskQueue.length, tps.target));
  let cycleRevenue = 0, cycleCost = 0, cycleTax = 0;

  for (const task of pendingTasks) {
    const taskCost = task.cost || 0;
    const taskPrice = task.price || 0;
    const taskProfit = taskPrice - taskCost;
    const taskTime = task.time_ms || 0;

    // TPS control
    if (tps.tasks_this_window >= tps.target) { tps.throttled++; taskQueue.unshift(task); break; }

    // Profitability gate
    if (taskProfit < taskMetrics.min_profit_threshold) { tps.rejected_unprofitable++; continue; }

    // Cost gate
    if (taskCost > taskMetrics.cost_threshold) { tps.rejected_unprofitable++; continue; }

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
    accumulation.total_in += netValue;

    // 𝓛₁ TUNNEL + 𝓛₂ GATEKEEPER: atomic SQLite commit, idempotent on retry
    const ikey = crypto.createHash('sha256')
      .update('econ_cycle_' + econCycle + '_' + netValue.toFixed(8))
      .digest('hex').slice(0, 32);
    await require('./supaclaw-core.js').getCore().treasuryCredit(
      +netValue.toFixed(8), 'economy_cycle_net', ikey
    );

    // Read-only mirror: derived state only, never source of truth
    const committed = require('./supaclaw-core.js').getCore().read('treasury', { balance: 0, earned: 0 });
    state.treasury.balance = committed.balance;
    state.treasury.earned  = committed.earned;
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

  // economyLoop is async -- catch both sync throws and rejected Promises
  setInterval(() => {
    economyLoop(state, broadcast).catch(e => console.error('[ECON] Loop error:', e.message));
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

  // ── TASK MARKETPLACE ─────────────────────────────────────────────────────
const agentSkills = {
  scraper: { skills: ['web_scraping', 'data_collection', 'parsing'], min_task_length: 20 },
  writer: { skills: ['content_writing', 'copywriting', 'documentation'], min_task_length: 100 },
  analyst: { skills: ['data_analysis', 'reporting', 'analytics'], min_task_length: 50 },
  coder: { skills: ['programming', 'code_review', 'debugging'], min_task_length: 50 },
  designer: { skills: ['ui_design', 'visual_design', 'ui_prototyping'], min_task_length: 50 },
  researcher: { skills: ['research', 'data_gathering', 'analysis'], min_task_length: 50 },
  qa: { skills: ['testing', 'quality_assurance', 'test_automation'], min_task_length: 50 },
};

const agentRegistry = new Map();

function registerAgent(agentId, agentType, capabilities = []) {
  agentRegistry.set(agentId, { type: agentType, capabilities, active_tasks: 0, registered_at: Date.now() });
}

function findBestAgent(agentTypeNeeded) {
  const validTypes = Object.keys(agentSkills);
  if (!validTypes.includes(agentTypeNeeded)) return null;

  const needed = agentSkills[agentTypeNeeded].skills;
  let bestAgent = null;
  let bestScore = -1;

  for (const [agentId, agent] of agentRegistry) {
    const hasType = agent.type === agentTypeNeeded || agent.capabilities.some(c => needed.includes(c));
    if (!hasType) continue;

    const workload = agent.active_tasks || 0;
    const score = 100 - workload;
    if (score > bestScore) {
      bestScore = score;
      bestAgent = agentId;
    }
  }

  return bestAgent;
}

function assignTaskToAgent(task) {
  const bestAgent = findBestAgent(task.agent_type_needed);
  if (bestAgent) {
    task.assigned_to = bestAgent;
    task.status = 'assigned';
    task.assigned_at = Date.now();
    const agent = agentRegistry.get(bestAgent);
    if (agent) agent.active_tasks++;
  }
}
  // POST /api/tasks/submit - submit new task for processing
  app.post('/api/tasks/submit', (req, res) => {
    const { title, description, price, agent_type_needed, deadline } = req.body;
    if (!title || !price || !agent_type_needed) {
      return res.status(400).json({ ok: false, error: 'title, price, and agent_type_needed are required' });
    }
    const validTypes = ['scraper', 'writer', 'analyst', 'coder', 'designer', 'researcher', 'qa'];
    if (!validTypes.includes(agent_type_needed)) {
      return res.status(400).json({ ok: false, error: 'agent_type_needed must be scraper/writer/analyst/coder/designer/researcher/qa' });
    }
    const task = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      description: description || '',
      price: parseFloat(price) || 0,
      agent_type_needed,
      deadline: deadline || null,
      status: 'pending',
      assigned_to: null,
      completed_at: null,
      payout: null,
      created_at: Date.now(),
    };
    taskQueue.push(task);
    assignTaskToAgent(task);
    res.json({ ok: true, task });
  });

  // GET /api/tasks/available - list pending tasks with optional filtering
  app.get('/api/tasks/available', (req, res) => {
    const { agent_type, status = 'pending' } = req.query;
    let tasks = taskQueue.filter(t => t.status === status || !status);
    if (agent_type) {
      tasks = tasks.filter(t => t.agent_type_needed === agent_type);
    }
    res.json({ ok: true, count: tasks.length, tasks });
  });

  // POST /api/tasks/:id/assign - assign task to an agent
  app.post('/api/tasks/:id/assign', (req, res) => {
    const { agent_id } = req.body;
    const task = taskQueue.find(t => t.id === req.params.id);
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }
    if (task.status !== 'pending') {
      return res.status(400).json({ ok: false, error: 'Task is not available' });
    }
    if (!agent_id) {
      return res.status(400).json({ ok: false, error: 'agent_id required' });
    }
    task.status = 'assigned';
    task.assigned_to = agent_id;
    task.assigned_at = Date.now();
    res.json({ ok: true, task });
  });

  // POST /api/tasks/:id/complete - mark task complete, calculate payout, credit agent
  app.post('/api/tasks/:id/complete', (req, res) => {
    const { agent_id, cost = 0, time_ms = 0 } = req.body;
    const task = taskQueue.find(t => t.id === req.params.id);
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }
    if (task.status !== 'assigned') {
      return res.status(400).json({ ok: false, error: 'Task is not assigned' });
    }
    if (!agent_id) {
      return res.status(400).json({ ok: false, error: 'agent_id required' });
    }
    const payout = task.price;
    task.status = 'completed';
    task.completed_at = Date.now();
    task.payout = payout;
    task.cost = parseFloat(cost) || 0;
    task.time_ms = parseInt(time_ms) || 0;
    const account = getAccount(agent_id);
    account.balance += payout;
    account.earned += payout;
    account.transactions.push({ type: 'task_payout', task_id: task.id, amount: payout, ts: Date.now() });
    res.json({ ok: true, task, payout, account_balance: account.balance });
  });

  // GET /api/agents/earnings/:agentId - get agent earnings
  app.get('/api/agents/earnings/:agentId', (req, res) => {
    const account = getAccount(req.params.agentId);
    res.json({ ok: true,
      agent_id: req.params.agentId,
      balance: account.balance,
      earned: account.earned,
      spent: account.spent,
      transaction_count: account.transactions.length,
    });
  });

  // POST /api/agents/earnings/:agentId/withdraw - withdraw from agent earnings
  app.post('/api/agents/earnings/:agentId/withdraw', (req, res) => {
    const { amount } = req.body;
    const agentId = req.params.agentId;
    const account = getAccount(agentId);
    const amt = parseFloat(amount) || 0;
    if (amt <= 0 || amt > account.balance) {
      return res.status(400).json({ ok: false, error: 'Invalid withdrawal amount' });
    }
    account.balance -= amt;
    account.spent += amt;
    account.transactions.push({ type: 'withdraw', amount: amt, ts: Date.now() });
    res.json({ ok: true, balance: account.balance, withdrawn: amt });
  });

  // POST /api/agents/register - register an agent
  app.post('/api/agents/register', (req, res) => {
    const { agent_id, agent_type, capabilities = [] } = req.body;
    if (!agent_id || !agent_type) {
      return res.status(400).json({ ok: false, error: 'agent_id and agent_type required' });
    }
    const validTypes = Object.keys(agentSkills);
    if (!validTypes.includes(agent_type)) {
      return res.status(400).json({ ok: false, error: 'agent_type must be scraper/writer/analyst/coder/designer/researcher/qa' });
    }
    registerAgent(agent_id, agent_type, capabilities);
    res.json({ ok: true, agent_id, agent_type });
  });

  // GET /api/agents - list registered agents
  app.get('/api/agents', (_req, res) => {
    const agents = [...agentRegistry.values()].map(a => ({ ...a, count: agentRegistry.size }));
    res.json({ ok: true, count: agentRegistry.size, agents });
  });
};
