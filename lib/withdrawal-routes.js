/**
 * BRIDGE AI OS — User BRDG Withdrawal Routes
 *
 * Endpoints for user-initiated BRDG token withdrawals.
 * Requires JWT auth (Authorization: Bearer <token>).
 *
 * Routes:
 *   POST /api/user/withdraw/brdg    — withdraw BRDG to linked wallet
 *   GET  /api/user/withdraw/history  — withdrawal history
 *   GET  /api/user/withdraw/limits   — daily limits & remaining
 */

'use strict';

const jwt = require('jsonwebtoken');
const { supabase } = require('./supabase');

// Graceful require — brdg-chain may not be available if ethers isn't installed
let brdgChain;
try { brdgChain = require('./brdg-chain'); } catch (e) { console.warn('[withdrawal-routes] brdg-chain unavailable:', e.message); brdgChain = null; }

const JWT_SECRET = process.env.JWT_SECRET || process.env.BRIDGE_SIWE_JWT_SECRET;
const DAILY_LIMIT = 10000; // max BRDG per day per user

// ── Auth middleware ─────────────────────────────────────────────────────────

function authenticateJWT(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ ok: false, error: 'Authorization token required' });
  if (!JWT_SECRET) return res.status(500).json({ ok: false, error: 'JWT secret not configured' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function todayStart() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function getDailyUsed(userId) {
  const { data, error } = await supabase
    .from('withdrawal_requests')
    .select('amount')
    .eq('user_id', userId)
    .gte('created_at', todayStart());

  if (error) {
    console.error('[withdrawal-routes] Failed to query daily usage:', error.message);
    return 0;
  }
  return (data || []).reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);
}

// ── Route mount ─────────────────────────────────────────────────────────────

function mount(app) {

  // POST /api/user/withdraw/brdg — withdraw BRDG to user's linked wallet
  app.post('/api/user/withdraw/brdg', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.user_id || req.user.sub || req.user.id;
      const { amount } = req.body || {};

      // Validate amount
      const numAmount = parseFloat(amount);
      if (!amount || isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ ok: false, error: 'amount must be a positive number' });
      }
      if (numAmount > DAILY_LIMIT) {
        return res.status(400).json({ ok: false, error: `amount exceeds daily max of ${DAILY_LIMIT} BRDG` });
      }

      // Check daily limit
      const dailyUsed = await getDailyUsed(userId);
      if (dailyUsed + numAmount > DAILY_LIMIT) {
        return res.status(400).json({
          ok: false,
          error: `Daily limit exceeded. Used: ${dailyUsed}, Remaining: ${DAILY_LIMIT - dailyUsed} BRDG`
        });
      }

      // Look up user's wallet address
      const { data: user, error: userErr } = await supabase
        .from('users')
        .select('wallet_address')
        .eq('id', userId)
        .single();

      if (userErr || !user) {
        return res.status(404).json({ ok: false, error: 'User not found' });
      }
      if (!user.wallet_address) {
        return res.status(400).json({ ok: false, error: 'Link your wallet first via SIWE' });
      }

      // Execute on-chain transfer
      if (!brdgChain || typeof brdgChain.transferBRDG !== 'function') {
        return res.status(503).json({ ok: false, error: 'brdg-chain module not available — install ethers on VPS' });
      }

      const result = await brdgChain.transferBRDG(user.wallet_address, amount);

      // Log to withdrawal_requests table
      const { error: insertErr } = await supabase
        .from('withdrawal_requests')
        .insert({
          user_id: userId,
          amount: numAmount,
          tx_hash: result.tx_hash || result.txHash || null,
          status: 'completed',
          created_at: new Date().toISOString()
        });

      if (insertErr) {
        console.error('[withdrawal-routes] Failed to log withdrawal:', insertErr.message);
        // Don't fail the response — the on-chain tx already succeeded
      }

      res.json({
        ok: true,
        tx_hash: result.tx_hash || result.txHash,
        amount: numAmount,
        to: user.wallet_address
      });

    } catch (e) {
      console.error('[withdrawal-routes] Withdrawal error:', e.message);
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // GET /api/user/withdraw/history — user's withdrawal history
  app.get('/api/user/withdraw/history', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.user_id || req.user.sub || req.user.id;

      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        return res.status(500).json({ ok: false, error: 'Failed to fetch history: ' + error.message });
      }

      res.json({ ok: true, withdrawals: data || [] });

    } catch (e) {
      console.error('[withdrawal-routes] History error:', e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/user/withdraw/limits — daily withdrawal limits
  app.get('/api/user/withdraw/limits', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.user_id || req.user.sub || req.user.id;
      const dailyUsed = await getDailyUsed(userId);

      res.json({
        ok: true,
        daily_limit: DAILY_LIMIT,
        daily_used: dailyUsed,
        remaining: Math.max(0, DAILY_LIMIT - dailyUsed),
        cooldown_hours: 0
      });

    } catch (e) {
      console.error('[withdrawal-routes] Limits error:', e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}

module.exports = { mount };
