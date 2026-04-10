// =============================================================================
// BRIDGE AI OS — Economy Routes
// Agent-to-agent economy endpoints: balances, task marketplace, stats, funding
// =============================================================================
'use strict';

const ledger       = require('./agent-ledger');
const market       = require('./task-market');
const exchangeRate = require('./exchange-rate');
const validation   = require('./validation');

// Graceful require for PayFast
let payfast;
try { payfast = require('../lib/payfast'); } catch (_) { payfast = null; }

// Graceful require for rate-limit
let rateLimit;
try { rateLimit = require('express-rate-limit'); } catch (_) {
  rateLimit = () => (_req, _res, next) => next();
}

// Fallback constants — only used if exchange-rate module throws
const FALLBACK_ZAR_TO_BRDG = 10;  // 1 ZAR = 10 BRDG
const FALLBACK_BRDG_TO_ZAR = 0.1; // 1 BRDG = 0.1 ZAR

function getCurrentRates() {
  try {
    const rateInfo = exchangeRate.getBrdgRate();
    const zarToBrdg = rateInfo.rate || FALLBACK_ZAR_TO_BRDG;
    const brdgToZar = zarToBrdg > 0 ? Math.round((1 / zarToBrdg) * 10000) / 10000 : FALLBACK_BRDG_TO_ZAR;
    return { zarToBrdg, brdgToZar };
  } catch (_) {
    return { zarToBrdg: FALLBACK_ZAR_TO_BRDG, brdgToZar: FALLBACK_BRDG_TO_ZAR };
  }
}

function requireAdmin(req, res, next) {
  const secret = req.headers['x-bridge-secret'];
  if (!secret || secret !== process.env.BRIDGE_INTERNAL_SECRET) {
    return res.status(403).json({ ok: false, error: 'Admin secret required' });
  }
  next();
}

function registerEconomyRoutes(app) {

  // ── AGENT BALANCES ──────────────────────────────────────────────────────────

  app.get('/api/economy/balances', async (_req, res) => {
    try {
      const balances = await ledger.getAllBalances();
      res.json({ ok: true, balances, count: balances.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/economy/balance/:agentId', async (req, res) => {
    const { agentId } = req.params;
    try {
      const balance = await ledger.getBalance(agentId);
      const history = await ledger.getHistory(agentId);
      res.json({ ok: true, agentId, balance, history });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Manual transfer between agents (admin only)
  app.post('/api/economy/transfer',
    requireAdmin,
    rateLimit({ windowMs: 60000, max: 10, message: 'Too many requests' }),
    async (req, res) => {
      const { from, to, amount, memo } = req.body;
      if (!from || !to || !amount) {
        return res.status(400).json({ ok: false, error: 'from, to, and amount are required' });
      }
      try {
        const tx = await ledger.transfer(from, to, Number(amount), memo || '');
        res.json({ ok: true, transaction: tx });
      } catch (e) {
        res.status(400).json({ ok: false, error: e.message });
      }
    });

  // ── CHECKOUT — Convert BRDG cost to ZAR and generate PayFast payment URL ──

  app.post('/api/economy/checkout', async (req, res) => {
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

    const { brdgToZar } = getCurrentRates();
    const zarAmount = brdgNum * brdgToZar;

    try {
      const payment = payfast.buildPaymentUrl({
        amount: zarAmount,
        email,
        itemName: item_name || `BRDG Credit Purchase (${brdgNum} BRDG)`,
        firstName: first_name || 'Client',
        meta: JSON.stringify({ brdg_amount: brdgNum, source: 'checkout' }),
      });

      res.json({
        ok: true,
        brdg_amount: brdgNum,
        zar_amount: zarAmount,
        exchange_rate: brdgToZar,
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

  app.post('/api/economy/fund', async (req, res) => {
    const secret = req.headers['x-bridge-secret'];
    if (!secret || secret !== process.env.BRIDGE_INTERNAL_SECRET) {
      return res.status(403).json({ ok: false, error: 'Unauthorized: signature required' });
    }
    const { email, zar_amount } = req.body;
    if (!email || !zar_amount) {
      return res.status(400).json({ ok: false, error: 'email and zar_amount are required' });
    }
    const zarNum = Number(zar_amount);
    if (isNaN(zarNum) || zarNum <= 0) {
      return res.status(400).json({ ok: false, error: 'zar_amount must be a positive number' });
    }
    const { zarToBrdg } = getCurrentRates();
    const brdgAmount = zarNum * zarToBrdg;
    try {
      const tx = await ledger.credit(email, brdgAmount, `PayFast fund: R${zarNum}`, 'payfast_fund');
      res.json({
        ok: true,
        email,
        zar_amount: zarNum,
        brdg_credited: brdgAmount,
        exchange_rate: zarToBrdg,
        transaction: tx
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── TASK MARKETPLACE ────────────────────────────────────────────────────────

  app.get('/api/economy/tasks', async (req, res) => {
    const { status } = req.query;
    const tasks = typeof market.listTasks === 'function'
      ? await market.listTasks(status || undefined)
      : [];
    res.json({ ok: true, tasks, count: tasks.length });
  });

  app.post('/api/economy/tasks', async (req, res) => {
    const { poster, title, description, reward, source } = req.body;
    try {
      const opts = source ? { source } : undefined;
      const task = await market.postTask(poster, title, description, Number(reward), opts);
      res.json({ ok: true, task });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/economy/tasks/:id/claim', async (req, res) => {
    const { id } = req.params;
    const { agent } = req.body;
    if (!agent) return res.status(400).json({ ok: false, error: 'agent is required' });
    try {
      const task = await market.claimTask(id, agent);
      res.json({ ok: true, task });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/economy/tasks/:id/complete', async (req, res) => {
    const { id } = req.params;
    const { result } = req.body;
    try {
      const task = await market.completeTask(id, result);
      res.json({ ok: true, task, claimer: task.claimer_agent, reward: task.reward_brdg });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/economy/tasks/agent/:agentId', async (req, res) => {
    const { agentId } = req.params;
    const tasks = await market.getAgentTasks(agentId);
    res.json({ ok: true, agentId, tasks, count: tasks.length });
  });

  // ── ECONOMY STATS ──────────────────────────────────────────────────────────

  app.get('/api/economy/stats', async (_req, res) => {
    try {
      const stats = await ledger.getStats();
      // Enrich with on-chain BRDG data when agent economy is empty
      if (!stats.totalCirculating || stats.totalCirculating === 0) {
        try {
          const brdgChain = require('./brdg-chain');
          const chain = await brdgChain.getTokenStats();
          stats.totalCirculating = parseFloat(chain.token.totalSupply) || 0;
          stats.totalBurned = parseFloat(chain.token.totalBurned) || 0;
          stats.onChain = true;
        } catch (_) { /* RPC unavailable — keep zeros */ }
      }
      // Enrich with treasury balance
      if ((!stats.topEarners || stats.topEarners.length === 0)) {
        try {
          const db = require('./db');
          const bal = await db.getTreasuryBalance();
          stats.topEarners = [{ agent: 'Treasury', balance: bal }];
        } catch (_) {}
      }
      res.json({ ok: true, ...stats });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/economy/flow', async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    try {
      const transactions = await ledger.getRecentTransactions(limit);
      res.json({ ok: true, transactions, count: transactions.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  console.log('[ECON-ROUTES] Economy routes registered (12 endpoints)');
}

module.exports = { registerEconomyRoutes };
