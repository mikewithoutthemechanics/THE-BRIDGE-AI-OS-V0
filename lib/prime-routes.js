// =============================================================================
// BRIDGE AI OS — Prime Agent API Routes
// REST endpoints for the Prime Agent orchestration layer.
// =============================================================================
'use strict';

function registerPrimeRoutes(app) {
  let primes;
  try {
    primes = require('./prime-agents');
  } catch (e) {
    console.warn('[PRIME-ROUTES] prime-agents module unavailable:', e.message);
    return;
  }

  let ledger;
  try {
    ledger = require('./agent-ledger');
  } catch (_) {
    ledger = null;
  }

  // ── GET /api/primes — list all prime agents with balances and stats ───────
  app.get('/api/primes', (_req, res) => {
    try {
      const agents = primes.getPrimeAgents();
      const stats = primes.getPrimeStats();

      const enriched = agents.map(p => {
        let balance = null;
        if (ledger) {
          try {
            const bal = ledger.getBalance(p.id);
            balance = { balance: bal.balance, earned: bal.earned_total, spent: bal.spent_total };
          } catch (_) {}
        }
        const activity = stats.agents[p.id] || {};
        return { ...p, balance, activity };
      });

      res.json({
        ok: true,
        primes: enriched,
        count: enriched.length,
        loop_active: stats.loop_active,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── GET /api/primes/stats — aggregate prime stats ────────────────────────
  app.get('/api/primes/stats', (_req, res) => {
    try {
      res.json({ ok: true, ...primes.getPrimeStats() });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── GET /api/primes/:id — single prime agent detail ──────────────────────
  app.get('/api/primes/:id', (req, res) => {
    try {
      const prime = primes.getPrimeAgent(req.params.id);
      if (!prime) return res.status(404).json({ ok: false, error: 'Prime agent not found' });

      let balance = null;
      if (ledger) {
        try {
          const bal = ledger.getBalance(prime.id);
          balance = { balance: bal.balance, earned: bal.earned_total, spent: bal.spent_total, escrowed: bal.escrowed };
        } catch (_) {}
      }

      const stats = primes.getPrimeStats();
      const activity = stats.agents[prime.id] || {};

      res.json({ ok: true, ...prime, balance, activity });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── POST /api/primes/:id/think — ask a prime to think ────────────────────
  app.post('/api/primes/:id/think', async (req, res) => {
    try {
      const { question } = req.body || {};
      if (!question) return res.status(400).json({ ok: false, error: 'question is required' });

      const result = await primes.primeThink(req.params.id, question);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(e.message.includes('not found') ? 404 : 500).json({ ok: false, error: e.message });
    }
  });

  // ── POST /api/primes/:id/delegate — prime delegates a task ───────────────
  app.post('/api/primes/:id/delegate', (req, res) => {
    try {
      const { title, description, reward } = req.body || {};
      if (!title) return res.status(400).json({ ok: false, error: 'title is required' });

      const result = primes.delegateTask(req.params.id, { title, description, reward });
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(e.message.includes('not found') ? 404 : 500).json({ ok: false, error: e.message });
    }
  });

  // ── GET /api/primes/:id/report — prime generates domain report ───────────
  app.get('/api/primes/:id/report', async (req, res) => {
    try {
      const result = await primes.primeReport(req.params.id);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(e.message.includes('not found') ? 404 : 500).json({ ok: false, error: e.message });
    }
  });

  // ── GET /api/primes/:id/subordinates — list subordinate agents ───────────
  app.get('/api/primes/:id/subordinates', (req, res) => {
    try {
      const prime = primes.getPrimeAgent(req.params.id);
      if (!prime) return res.status(404).json({ ok: false, error: 'Prime agent not found' });

      const subordinates = prime.subordinates.map(id => {
        let balance = null;
        if (ledger) {
          try {
            const bal = ledger.getBalance(id);
            balance = { balance: bal.balance, earned: bal.earned_total, spent: bal.spent_total };
          } catch (_) {}
        }
        return { id, balance };
      });

      res.json({
        ok: true,
        prime: prime.id,
        prime_name: prime.name,
        subordinates,
        count: subordinates.length,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── POST /api/primes/council — all primes think about a question ─────────
  app.post('/api/primes/council', async (req, res) => {
    try {
      const { question } = req.body || {};
      if (!question) return res.status(400).json({ ok: false, error: 'question is required' });

      const agents = primes.getPrimeAgents();
      const responses = await Promise.allSettled(
        agents.map(p => primes.primeThink(p.id, question))
      );

      const results = responses.map((r, i) => {
        if (r.status === 'fulfilled') return r.value;
        return {
          prime: agents[i].id,
          name: agents[i].name,
          title: agents[i].title,
          domain: agents[i].domain,
          question,
          response: 'Error: ' + (r.reason?.message || 'unknown'),
          error: true,
        };
      });

      res.json({
        ok: true,
        question,
        responses: results,
        count: results.length,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  console.log('[PRIME-ROUTES] Prime Agent routes registered (8 endpoints)');
}

module.exports = { registerPrimeRoutes };
