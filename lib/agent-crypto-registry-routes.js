'use strict';
/**
 * Agent Crypto Wallet Registry — REST API
 * ========================================
 * Mounts read-only (and create) endpoints under /api/crypto-wallets/
 *
 * Endpoints:
 *   GET  /api/crypto-wallets/agents            — list all agent wallets   [admin]
 *   GET  /api/crypto-wallets/agents/:agentId   — single agent wallet      [client]
 *   POST /api/crypto-wallets/agents/:agentId   — ensure wallet exists     [admin]
 *   GET  /api/crypto-wallets/stats             — summary stats            [admin]
 *
 * Private keys are NEVER returned. Only public addresses.
 */

const registry     = require('./agent-crypto-registry');
const actionLogger = require('./agent-action-logger');
const { requireAdmin, requireClient } = require('../middleware/access-control');

/**
 * Mount all crypto-wallet routes on the given Express app.
 * @param {import('express').Application} app
 */
function mount(app) {
  // ── List all agent wallets ───────────────────────────────────────────────
  app.get('/api/crypto-wallets/agents', requireAdmin, async (req, res) => {
    try {
      const wallets = await registry.getAllWallets();
      res.json({ ok: true, count: wallets.length, wallets });
    } catch (err) {
      console.error('[crypto-wallets] GET /agents error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Get single agent wallet ──────────────────────────────────────────────
  app.get('/api/crypto-wallets/agents/:agentId', requireClient, async (req, res) => {
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
  app.post('/api/crypto-wallets/agents/:agentId', requireAdmin, async (req, res) => {
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
  app.get('/api/crypto-wallets/stats', requireAdmin, async (req, res) => {
    try {
      const stats = await registry.getCryptoStats();
      res.json({ ok: true, stats });
    } catch (err) {
      console.error('[crypto-wallets] GET /stats error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Action log: all recent actions ──────────────────────────────────────
  app.get('/api/crypto-wallets/actions', async (req, res) => {
    try {
      const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
      const action = req.query.action || null;
      const rows   = await actionLogger.getRecentActions({ limit, action });
      res.json({ ok: true, count: rows.length, actions: rows });
    } catch (err) {
      console.error('[crypto-wallets] GET /actions error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Action log: single agent ─────────────────────────────────────────────
  app.get('/api/crypto-wallets/actions/:agentId', async (req, res) => {
    try {
      const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
      const action = req.query.action || null;
      const since  = req.query.since  || null;
      const rows   = await actionLogger.getLog(req.params.agentId, { limit, action, since });
      res.json({ ok: true, count: rows.length, actions: rows });
    } catch (err) {
      console.error('[crypto-wallets] GET /actions/:id error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  console.log('[agent-crypto-registry-routes] Mounted /api/crypto-wallets/*');
}

module.exports = { mount };
