/**
 * API Routes for BRDG → ETH Swaps and DEX Operations
 * 
 * Mounts:
 *   POST /api/user/swap/brdg-to-eth  — Convert BRDG to ETH and send to user
 *   GET  /api/swap/quote             — Get BRDG→ETH swap quote
 *   GET  /api/swap/pool              — Check pool liquidity status
 */
'use strict';

const { requireAuth } = require('./session');

// Lazy-load swap module (ethers heavy)
let brdgSwap = null;
function getSwap() {
  if (!brdgSwap) brdgSwap = require('./brdg-swap');
  return brdgSwap;
}

// Lazy-load withdrawal engine
let withdrawEngine = null;
function getWithdrawEngine() {
  if (!withdrawEngine) withdrawEngine = require('./treasury-withdraw');
  return withdrawEngine;
}

/**
 * Mount swap routes on Express app
 * @param {object} app - Express app
 */
function mount(app) {
  
  // GET /api/swap/quote — Get BRDG→ETH conversion quote
  app.get('/api/swap/quote', async (req, res) => {
    try {
      const { amount } = req.query;
      if (!amount || isNaN(parseFloat(amount))) {
        return res.status(400).json({ ok: false, error: 'amount query param required' });
      }
      
      const quote = await getSwap().getSwapQuote(amount);
      res.json({ ok: true, quote });
    } catch (e) {
      console.error('[swap-routes] Quote error:', e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/swap/pool — Check pool liquidity
  app.get('/api/swap/pool', async (req, res) => {
    try {
      const status = await getSwap().checkPoolLiquidity();
      res.json({ ok: true, ...status });
    } catch (e) {
      console.error('[swap-routes] Pool check error:', e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /api/user/swap/brdg-to-eth — User-initiated BRDG→ETH swap withdrawal
  app.post('/api/user/swap/brdg-to-eth', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.user_id || req.user?.sub || req.user?.id;
      const { amount } = req.body || {};
      
      // Validate amount
      const numAmount = parseFloat(amount);
      if (!amount || isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ ok: false, error: 'amount must be a positive number' });
      }

      // Get user's linked wallet
      const { supabase } = require('./supabase');
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

      // Check pool has liquidity first
      const poolStatus = await getSwap().checkPoolLiquidity();
      if (!poolStatus.exists) {
        return res.status(503).json({ 
          ok: false, 
          error: 'BRDG/ETH pool has no liquidity. Contact admin.',
          pool: poolStatus 
        });
      }

      // Get quote for user confirmation
      const quote = await getSwap().getSwapQuote(amount);

      // Execute swap withdrawal using treasury engine
      const engine = getWithdrawEngine();
      const treasury = await engine.getTreasuryState();
      
      const result = await engine.executeWithdrawal({
        treasuryBalance: treasury.available,
        to: user.wallet_address,
        amount: numAmount,
        rail: 'brdg_to_eth',
        memo: `User swap to ETH for ${userId}`,
      });

      if (!result.ok) {
        return res.status(400).json(result);
      }

      // Ensure table exists then log the swap withdrawal
      try {
        await supabase.from('withdrawal_requests').select('id', { head: true, count: 'exact' });
      } catch (tableErr) {
        if (tableErr.code === '42P01') {
          console.warn('[swap-routes] withdrawal_requests missing — swap logged to console only');
        }
      }

      const { error: logErr } = await supabase
        .from('withdrawal_requests')
        .insert({
          user_id: userId,
          amount: numAmount,
          tx_hash: result.tx_hash,
          rail: 'brdg_to_eth',
          status: 'completed',
          metadata: {
            eth_out: result.pipeline?.find(p => p.step === 'brdg_swap')?.eth_out,
            quote: quote,
          },
          created_at: new Date().toISOString()
        });

      if (logErr && logErr.code === '42P01') {
        console.log('[swap-routes] Swap completed but table missing:', {
          userId, amount: numAmount, tx_hash: result.tx_hash
        });
      }

      if (logErr) {
        console.error('[swap-routes] Failed to log swap:', logErr.message);
      }

      res.json({
        ok: true,
        tx_hash: result.tx_hash,
        brdg_amount: numAmount,
        eth_estimate: quote.ethOut,
        to: user.wallet_address,
        pipeline: result.pipeline,
      });

    } catch (e) {
      console.error('[swap-routes] Swap error:', e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /api/admin/swap/execute — Admin-initiated swap to any address
  app.post('/api/admin/swap/execute', requireAuth, async (req, res) => {
    try {
      // Check admin role
      if (!req.user?.roles?.includes('admin')) {
        return res.status(403).json({ ok: false, error: 'Admin required' });
      }

      const { to, amount, memo } = req.body || {};
      
      if (!to || !ethers.isAddress(to)) {
        return res.status(400).json({ ok: false, error: 'Valid to address required' });
      }
      
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ ok: false, error: 'amount must be positive' });
      }

      // Check pool
      const poolStatus = await getSwap().checkPoolLiquidity();
      if (!poolStatus.exists) {
        return res.status(503).json({ 
          ok: false, 
          error: 'BRDG/ETH pool has no liquidity',
          pool: poolStatus 
        });
      }

      // Get quote
      const quote = await getSwap().getSwapQuote(amount);

      // Execute via treasury engine
      const engine = getWithdrawEngine();
      const treasury = await engine.getTreasuryState();
      
      const result = await engine.executeWithdrawal({
        treasuryBalance: treasury.available,
        to: to,
        amount: numAmount,
        rail: 'brdg_to_eth',
        memo: memo || `Admin swap to ${to.slice(0, 8)}...`,
      });

      if (!result.ok) {
        return res.status(400).json(result);
      }

      res.json({
        ok: true,
        tx_hash: result.tx_hash,
        brdg_amount: numAmount,
        eth_out: quote.ethOut,
        to: to,
        pipeline: result.pipeline,
      });

    } catch (e) {
      console.error('[swap-routes] Admin swap error:', e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}

// Import ethers for address validation
let ethers;
try { ethers = require('ethers'); } catch (_) {}

module.exports = { mount };
