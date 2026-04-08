// =============================================================================
// BRIDGE AI OS — Economy Routes
// Agent-to-agent economy endpoints: balances, task marketplace, stats, funding
// =============================================================================

const ledger = require('./agent-ledger');
const market = require('./task-market');

// Graceful require for PayFast
let payfast;
try { payfast = require('../lib/payfast'); } catch (_) { payfast = null; }

const ZAR_TO_BRDG = 10;  // 1 ZAR = 10 BRDG
const BRDG_TO_ZAR = 0.1; // 1 BRDG = 0.1 ZAR

function requireAdmin(req, res) {
  const secret = req.headers['x-bridge-secret'];
  if (!secret || secret !== process.env.BRIDGE_INTERNAL_SECRET) {
    res.status(403).json({ ok: false, error: 'Admin secret required' });
    return false;
  }
  return true;
}

function registerEconomyRoutes(app) {

  // ── AGENT BALANCES ──────────────────────────────────────────────────────────

  // All agent balances with leaderboard
  app.get('/api/economy/balances', (_req, res) => {
    const balances = ledger.getAllBalances();
    res.json({ ok: true, balances, count: balances.length });
  });

  // Single agent balance + recent history
  app.get('/api/economy/balance/:agentId', (req, res) => {
    const { agentId } = req.params;
    const balance = ledger.getBalance(agentId);
    const history = ledger.getHistory(agentId);
    res.json({ ok: true, agentId, balance, history });
  });

  // Manual transfer between agents (admin only)
  app.post('/api/economy/transfer', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { from, to, amount, memo } = req.body;
    if (!from || !to || !amount) {
      return res.status(400).json({ ok: false, error: 'from, to, and amount are required' });
    }
    try {
      const tx = ledger.transfer(from, to, Number(amount), memo || '');
      res.json({ ok: true, transaction: tx });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // ── TASK MARKETPLACE ────────────────────────────────────────────────────────

  // List tasks (query: ?status=open|claimed|completed)
  app.get('/api/economy/tasks', (req, res) => {
    const { status } = req.query;
    const tasks = typeof market.listTasks === 'function'
      ? market.listTasks(status || undefined)
      : [];
    res.json({ ok: true, tasks, count: tasks.length });
  });

  // Post a new task
  app.post('/api/economy/tasks', (req, res) => {
    const { poster, title, description, reward, source } = req.body;
    try {
      const opts = source ? { source } : undefined;
      const task = market.postTask(poster, title, description, Number(reward), opts);
      // Escrow: debit poster for the reward
      try {
        ledger.debit(poster, Number(reward), `Escrow for task ${task.id}`);
      } catch (e) {
        // If poster can't cover reward, still allow task but note it
        task._escrowFailed = e.message;
      }
      res.json({ ok: true, task });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // Claim a task
  app.post('/api/economy/tasks/:id/claim', (req, res) => {
    const { id } = req.params;
    const { agent } = req.body;
    if (!agent) return res.status(400).json({ ok: false, error: 'agent is required' });
    try {
      const task = market.claimTask(id, agent);
      res.json({ ok: true, task });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // Complete a task — pays out reward to claimant
  app.post('/api/economy/tasks/:id/complete', (req, res) => {
    const { id } = req.params;
    const { result } = req.body;
    try {
      const task = market.completeTask(id, result);
      // Pay the claimant
      const tx = ledger.credit(task.claimedBy, task.reward, `Reward for task ${task.id}`, 'task_reward');
      res.json({ ok: true, task, payout: tx });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // Tasks for a specific agent
  app.get('/api/economy/tasks/agent/:agentId', (req, res) => {
    const { agentId } = req.params;
    const tasks = market.getAgentTasks(agentId);
    res.json({ ok: true, agentId, tasks, count: tasks.length });
  });

  // ── ECONOMY STATS ──────────────────────────────────────────────────────────

  // Aggregate economy stats
  app.get('/api/economy/stats', (_req, res) => {
    const stats = ledger.getStats();
    res.json({ ok: true, ...stats });
  });

  // Recent transaction flow (last 50)
  app.get('/api/economy/flow', (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 50;
    const transactions = ledger.getRecentTransactions(limit);
    res.json({ ok: true, transactions, count: transactions.length });
  });

  // ── CHECKOUT — Convert BRDG cost to ZAR and generate PayFast payment URL ──

  app.post('/api/economy/checkout', (req, res) => {
    const { email, brdg_amount, item_name, first_name } = req.body;
    if (!email || !brdg_amount) {
      return res.status(400).json({ ok: false, error: 'email and brdg_amount are required' });
    }
    const brdgNum = Number(brdg_amount);
    if (isNaN(brdgNum) || brdgNum <= 0) {
      return res.status(400).json({ ok: false, error: 'brdg_amount must be a positive number' });
    }
    if (!payfast || typeof payfast.buildPaymentUrl !== 'function') {
      return res.status(503).json({ ok: false, error: 'PayFast module not available' });
    }

    const zarAmount = brdgNum * BRDG_TO_ZAR;

    try {
      const payment = payfast.buildPaymentUrl({
        amount: zarAmount,
        email,
        itemName: item_name || 'BRDG Credit Purchase (' + brdgNum + ' BRDG)',
        firstName: first_name || 'Client',
        meta: JSON.stringify({ brdg_amount: brdgNum, source: 'checkout' }),
      });

      res.json({
        ok: true,
        brdg_amount: brdgNum,
        zar_amount: zarAmount,
        exchange_rate: BRDG_TO_ZAR,
        payment_url: payment.url,
        payment_fields: payment.fields,
        payment_id: payment.paymentId,
        sandbox: payment.sandbox,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── AUTO-FUND ON PAYMENT ───────────────────────────────────────────────────

  // Called by PayFast webhook to credit a user with BRDG equivalent
  app.post('/api/economy/fund', (req, res) => {
    const { email, zar_amount } = req.body;
    if (!email || !zar_amount) {
      return res.status(400).json({ ok: false, error: 'email and zar_amount are required' });
    }
    const zarNum = Number(zar_amount);
    if (isNaN(zarNum) || zarNum <= 0) {
      return res.status(400).json({ ok: false, error: 'zar_amount must be a positive number' });
    }
    const brdgAmount = zarNum * ZAR_TO_BRDG;
    try {
      const tx = ledger.credit(email, brdgAmount, `PayFast fund: R${zarNum}`, 'payfast_fund');
      res.json({
        ok: true,
        email,
        zar_amount: zarNum,
        brdg_credited: brdgAmount,
        exchange_rate: ZAR_TO_BRDG,
        transaction: tx
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}

module.exports = { registerEconomyRoutes };
