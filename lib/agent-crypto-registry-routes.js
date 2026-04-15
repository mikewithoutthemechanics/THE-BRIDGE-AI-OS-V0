'use strict';
/**
 * Agent Crypto Wallet Registry — REST API
 * ========================================
 * Mounts read-only (and create) endpoints under /api/crypto-wallets/
 *
 * Endpoints:
 *   GET  /api/crypto-wallets/agents            — list all agent wallets
 *   GET  /api/crypto-wallets/agents/:agentId   — single agent wallet
 *   POST /api/crypto-wallets/agents/:agentId   — ensure wallet exists (idempotent)
 *   GET  /api/crypto-wallets/stats             — summary stats
 *
 * Private keys are NEVER returned. Only public addresses.
 */

const registry = require('./agent-crypto-registry');

/**
 * Mount all crypto-wallet routes on the given Express app.
 * @param {import('express').Application} app
 */
function mount(app) {
  // ── List all agent wallets ───────────────────────────────────────────────
  app.get('/api/crypto-wallets/agents', async (req, res) => {
    try {
      const wallets = await registry.getAllWallets();
      res.json({ ok: true, count: wallets.length, wallets });
    } catch (err) {
      console.error('[crypto-wallets] GET /agents error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Get single agent wallet ──────────────────────────────────────────────
  app.get('/api/crypto-wallets/agents/:agentId', async (req, res) => {
    try {
      const wallet = await registry.getWallet(req.params.agentId);
      if (!wallet) return res.status(404).json({ ok: false, error: 'Wallet not found' });
      res.json({ ok: true, wallet });
    } catch (err) {
      console.error('[crypto-wallets] GET /agents/:id error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Ensure wallet exists (create if missing — idempotent) ────────────────
  app.post('/api/crypto-wallets/agents/:agentId', async (req, res) => {
    try {
      const { agentId } = req.params;
      const agentName   = req.body?.name || req.body?.agent_name || '';
      const wallet      = await registry.ensureWallet(agentId, agentName);
      res.json({ ok: true, wallet });
    } catch (err) {
      console.error('[crypto-wallets] POST /agents/:id error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Stats ────────────────────────────────────────────────────────────────
  app.get('/api/crypto-wallets/stats', async (req, res) => {
    try {
      const stats = await registry.getCryptoStats();
      res.json({ ok: true, stats });
    } catch (err) {
      console.error('[crypto-wallets] GET /stats error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  console.log('[agent-crypto-registry-routes] Mounted /api/crypto-wallets/*');
}

module.exports = { mount };
