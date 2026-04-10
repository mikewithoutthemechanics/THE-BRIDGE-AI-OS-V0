/**
 * BRIDGE AI OS — Agent Earnings Claim Routes
 *
 * Allows users to claim BRDG earned by their agents.
 * Off-chain balance is debited from the agent ledger; on-chain transfer
 * is queued for async processing (or held pending if no wallet linked).
 *
 * Routes:
 *   POST /api/agent/claim           — claim BRDG from an agent's balance
 *   GET  /api/agent/claims          — list user's claim history
 *   POST /api/agent/claims/process  — admin: process queued on-chain transfers
 */

'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { supabase } = require('./supabase');
const ledger = require('./agent-ledger');
const registry = require('./agent-registry');

// Graceful require — brdg-chain needs ethers which may not be installed
let brdgChain = null;
try { brdgChain = require('./brdg-chain'); } catch (_) {}

// ── Helpers ────────────────────────────────────────────────────────────────

function claimId() {
  return 'claim_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

// ── Ensure agent_claims table exists in Supabase ──────────────────────────
// We create it via an RPC call or just rely on it existing.
// The table should be created in Supabase migrations; this is a safety net.
let _tableChecked = false;
async function ensureClaimsTable() {
  if (_tableChecked) return;
  _tableChecked = true;
  // Try a lightweight probe; if it fails the table doesn't exist yet.
  // In production the table is created by migration. Log a warning if missing.
  const { error } = await supabase
    .from('agent_claims')
    .select('id')
    .limit(1);
  if (error && error.code === '42P01') {
    console.warn('[claim-routes] agent_claims table missing — run migration to create it.');
    console.warn('[claim-routes] Expected schema: id text PK, user_id text, agent_id text, amount real, wallet_address text, status text, tx_hash text, error text, created_at timestamptz, processed_at timestamptz');
  }
}

// ── JWT auth middleware (inline, matches project pattern) ─────────────────

function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.access_token
      || (req.headers.authorization || '').replace(/^Bearer\s+/, '')
      || req.query?.token;

    if (!token) return res.status(401).json({ error: 'Missing auth token' });

    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ error: 'Server misconfigured: JWT_SECRET not set' });

    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired' });
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Admin secret check ───────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  const secret = req.headers['x-bridge-secret'];
  const expected = process.env.BRIDGE_INTERNAL_SECRET;
  if (!secret || !expected || secret !== expected) {
    return res.status(403).json({ error: 'Forbidden — admin secret required' });
  }
  next();
}

// ── Route mount ──────────────────────────────────────────────────────────

function mount(app) {
  // Ensure table exists on first request (non-blocking)
  ensureClaimsTable().catch(() => {});

  // ────────────────────────────────────────────────────────────────────────
  // POST /api/agent/claim — claim BRDG from an agent's off-chain balance
  // ────────────────────────────────────────────────────────────────────────
  app.post('/api/agent/claim', requireAuth, async (req, res) => {
    try {
      const userId = req.user.id || req.user.sub || req.user.user_id;
      if (!userId) return res.status(401).json({ ok: false, error: 'Cannot determine user id from token' });

      const { agent_id, amount } = req.body || {};

      // ── Validate inputs ──────────────────────────────────────────────
      if (!agent_id || typeof agent_id !== 'string') {
        return res.status(400).json({ ok: false, error: 'agent_id is required' });
      }
      const numAmount = Number(amount);
      if (!Number.isFinite(numAmount) || numAmount <= 0) {
        return res.status(400).json({ ok: false, error: 'amount must be a positive number' });
      }

      // ── Verify agent exists in registry ──────────────────────────────
      const agent = await registry.getById(agent_id);
      if (!agent) {
        return res.status(404).json({ ok: false, error: 'Agent not found: ' + agent_id });
      }

      // ── Check agent's off-chain balance ──────────────────────────────
      const balRow = await ledger.getBalance(agent_id);
      const available = (balRow.balance || 0) - (balRow.escrowed || 0);
      if (available < numAmount) {
        return res.status(400).json({
          ok: false,
          error: 'Insufficient agent balance: ' + available.toFixed(4) + ' BRDG available, requested ' + numAmount,
        });
      }

      // ── Debit agent off-chain ────────────────────────────────────────
      await ledger.debit(agent_id, numAmount, 'user_claim', 'Claimed to user wallet');

      // ── Look up user's wallet ────────────────────────────────────────
      let walletAddress = null;
      let status = 'pending_wallet';

      const { data: userData } = await supabase
        .from('users')
        .select('wallet_address')
        .eq('id', userId)
        .single();

      if (userData && userData.wallet_address) {
        walletAddress = userData.wallet_address;
        status = 'queued';
      }

      // ── Persist claim record ─────────────────────────────────────────
      const id = claimId();
      const now = new Date().toISOString();

      const { error: insertErr } = await supabase
        .from('agent_claims')
        .insert({
          id,
          user_id: userId,
          agent_id,
          amount: numAmount,
          wallet_address: walletAddress,
          status,
          tx_hash: null,
          error: null,
          created_at: now,
          processed_at: null,
        });

      if (insertErr) {
        console.error('[claim-routes] insert failed:', insertErr.message);
        // The debit already happened — log it but still return success shape
        // so the user knows their balance was debited.
        return res.status(500).json({
          ok: false,
          error: 'Claim record failed to save — contact support. Debit was applied.',
          debit_applied: true,
        });
      }

      return res.json({
        ok: true,
        claim_id: id,
        agent_id,
        amount: numAmount,
        status,
      });
    } catch (err) {
      console.error('[claim-routes] POST /api/agent/claim error:', err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // GET /api/agent/claims — list claim history for the authenticated user
  // ────────────────────────────────────────────────────────────────────────
  app.get('/api/agent/claims', requireAuth, async (req, res) => {
    try {
      const userId = req.user.id || req.user.sub || req.user.user_id;
      if (!userId) return res.status(401).json({ ok: false, error: 'Cannot determine user id from token' });

      const limit = Math.min(parseInt(req.query.limit) || 50, 200);

      const { data: claims, error } = await supabase
        .from('agent_claims')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[claim-routes] GET /api/agent/claims error:', error.message);
        return res.status(500).json({ ok: false, error: 'Failed to fetch claims' });
      }

      return res.json({ ok: true, claims: claims || [], count: (claims || []).length });
    } catch (err) {
      console.error('[claim-routes] GET /api/agent/claims error:', err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // POST /api/agent/claims/process — admin: process queued on-chain claims
  // ────────────────────────────────────────────────────────────────────────
  app.post('/api/agent/claims/process', requireAdmin, async (req, res) => {
    try {
      if (!brdgChain || typeof brdgChain.transferBRDG !== 'function') {
        return res.status(503).json({
          ok: false,
          error: 'brdg-chain module not available — install ethers on VPS',
        });
      }

      // Fetch all queued claims
      const { data: queued, error: fetchErr } = await supabase
        .from('agent_claims')
        .select('*')
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(100);

      if (fetchErr) {
        return res.status(500).json({ ok: false, error: 'Failed to fetch queued claims: ' + fetchErr.message });
      }

      if (!queued || queued.length === 0) {
        return res.json({ ok: true, processed: 0, succeeded: 0, failed: 0, message: 'No queued claims' });
      }

      let succeeded = 0;
      let failed = 0;
      const results = [];

      for (const claim of queued) {
        const now = new Date().toISOString();
        try {
          const result = await brdgChain.transferBRDG(claim.wallet_address, String(claim.amount));

          await supabase
            .from('agent_claims')
            .update({
              status: 'completed',
              tx_hash: result.tx_hash || null,
              processed_at: now,
            })
            .eq('id', claim.id);

          succeeded++;
          results.push({ id: claim.id, status: 'completed', tx_hash: result.tx_hash });
        } catch (txErr) {
          await supabase
            .from('agent_claims')
            .update({
              status: 'failed',
              error: txErr.message,
              processed_at: now,
            })
            .eq('id', claim.id);

          failed++;
          results.push({ id: claim.id, status: 'failed', error: txErr.message });
        }
      }

      return res.json({
        ok: true,
        processed: queued.length,
        succeeded,
        failed,
        results,
      });
    } catch (err) {
      console.error('[claim-routes] POST /api/agent/claims/process error:', err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  console.log('[claim-routes] Mounted: POST /api/agent/claim, GET /api/agent/claims, POST /api/agent/claims/process');
}

module.exports = { mount };
