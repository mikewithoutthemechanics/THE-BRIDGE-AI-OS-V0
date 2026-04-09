/**
 * BRIDGE AI OS -- Public API Key System
 *
 * Supabase-backed API key management for paying users.
 * Handles key generation, validation, rate limiting, and BRDG credit tracking.
 *
 * Plans:
 *   starter:    10 req/min,   initial 100 BRDG
 *   pro:        60 req/min,   initial 1000 BRDG
 *   enterprise: 300 req/min,  initial 10000 BRDG
 *
 * Usage:
 *   const apiKeys = require('./lib/api-keys');
 *   const key = await apiKeys.createKey('user@example.com', 'pro');
 *   const data = await apiKeys.validateKey(key.api_key);
 *   await apiKeys.addCredits(key.api_key, 500);
 */

'use strict';

const { supabase } = require('./supabase');
const crypto = require('crypto');

// -- Rate-limit tracking (in-memory sliding window) --------------------------
// Map<api_key, timestamp[]>
const rateBuckets = new Map();

// -- Plan config -------------------------------------------------------------
const PLANS = {
  starter:    { rate_limit_per_min: 10,  initial_brdg: 100   },
  pro:        { rate_limit_per_min: 60,  initial_brdg: 1000  },
  enterprise: { rate_limit_per_min: 300, initial_brdg: 10000 },
};

// -- Helpers -----------------------------------------------------------------
function generateApiKey() {
  const rand = crypto.randomBytes(18).toString('base64url');
  return `brdg_live_${rand}`;
}

function checkRateLimit(apiKey, limit) {
  const now = Date.now();
  const windowMs = 60000;
  let bucket = rateBuckets.get(apiKey);
  if (!bucket) {
    bucket = [];
    rateBuckets.set(apiKey, bucket);
  }
  // Prune entries older than 1 minute
  while (bucket.length > 0 && bucket[0] <= now - windowMs) {
    bucket.shift();
  }
  if (bucket.length >= limit) {
    return false; // rate limited
  }
  bucket.push(now);
  return true;
}

// -- Public API --------------------------------------------------------------

/**
 * Create a new API key for a user.
 * @param {string} email
 * @param {string} plan - 'starter' | 'pro' | 'enterprise'
 * @returns {Promise<{ key_id: number, api_key: string, email: string, plan: string }>}
 */
async function createKey(email, plan) {
  if (!plan) plan = 'starter';
  if (!email || typeof email !== 'string') {
    throw new Error('Valid email is required');
  }
  const planConfig = PLANS[plan];
  if (!planConfig) {
    throw new Error('Invalid plan: ' + plan + '. Must be one of: ' + Object.keys(PLANS).join(', '));
  }

  const api_key = generateApiKey();
  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      api_key,
      email: email.trim().toLowerCase(),
      plan,
      rate_limit_per_min: planConfig.rate_limit_per_min,
      brdg_balance: planConfig.initial_brdg,
    })
    .select()
    .single();

  if (error) throw new Error('Failed to create API key: ' + error.message);

  return {
    key_id: data.key_id,
    api_key: data.api_key,
    email: data.email,
    plan: data.plan,
    rate_limit_per_min: data.rate_limit_per_min,
    brdg_balance: data.brdg_balance,
  };
}

/**
 * Validate an API key and increment usage counters.
 * Returns key data if valid, null if not found.
 * Throws if rate-limited.
 * @param {string} apiKey
 * @returns {Promise<object|null>}
 */
async function validateKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return null;

  const { data: row, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('api_key', apiKey)
    .single();

  if (error || !row) return null;

  // Check rate limit
  if (!checkRateLimit(apiKey, row.rate_limit_per_min)) {
    const err = new Error('Rate limit exceeded');
    err.code = 'RATE_LIMITED';
    err.retryAfterSecs = 60;
    throw err;
  }

  // Check sufficient BRDG balance (1 BRDG per API call)
  const COST_PER_CALL = 1;
  if (row.brdg_balance < COST_PER_CALL) {
    const err = new Error('Insufficient BRDG balance -- top up your account');
    err.code = 'INSUFFICIENT_BALANCE';
    err.balance = row.brdg_balance;
    throw err;
  }

  // Deduct BRDG credit via agent-ledger for on-chain accounting
  let agentLedger;
  try { agentLedger = require('./agent-ledger'); } catch (_) { agentLedger = null; }
  if (agentLedger && typeof agentLedger.debit === 'function') {
    try {
      agentLedger.debit(
        row.email,
        COST_PER_CALL,
        'api_call_cost',
        'API call debit for key ' + apiKey.slice(0, 12) + '...'
      );
    } catch (_) {
      // Ledger debit failed (e.g. agent not seeded) -- still allow call but log it
    }
  }

  // Deduct from local key balance and increment call counters in one update
  const { error: updateErr } = await supabase
    .from('api_keys')
    .update({
      brdg_balance: row.brdg_balance - COST_PER_CALL,
      calls_today: row.calls_today + 1,
      calls_total: row.calls_total + 1,
      last_used: new Date().toISOString(),
    })
    .eq('api_key', apiKey);

  if (updateErr) console.error('[api-keys] Update failed:', updateErr.message);

  return {
    key_id: row.key_id,
    api_key: row.api_key,
    email: row.email,
    plan: row.plan,
    rate_limit_per_min: row.rate_limit_per_min,
    calls_today: row.calls_today + 1,
    calls_total: row.calls_total + 1,
    brdg_balance: row.brdg_balance - COST_PER_CALL,
    created_at: row.created_at,
    last_used: row.last_used,
  };
}

/**
 * Get usage stats for a key.
 * @param {string} apiKey
 * @returns {Promise<object|null>}
 */
async function getUsage(apiKey) {
  const { data: row, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('api_key', apiKey)
    .single();

  if (error || !row) return null;

  return {
    key_id: row.key_id,
    email: row.email,
    plan: row.plan,
    rate_limit_per_min: row.rate_limit_per_min,
    calls_today: row.calls_today,
    calls_total: row.calls_total,
    brdg_balance: row.brdg_balance,
    created_at: row.created_at,
    last_used: row.last_used,
  };
}

/**
 * Add BRDG credits to a key.
 * @param {string} apiKey
 * @param {number} brdgAmount
 * @returns {Promise<{ success: boolean, new_balance: number }>}
 */
async function addCredits(apiKey, brdgAmount) {
  if (typeof brdgAmount !== 'number' || brdgAmount <= 0) {
    throw new Error('brdgAmount must be a positive number');
  }

  const { data: row, error } = await supabase
    .from('api_keys')
    .select('brdg_balance')
    .eq('api_key', apiKey)
    .single();

  if (error || !row) throw new Error('API key not found');

  const newBalance = row.brdg_balance + brdgAmount;
  const { error: updateErr } = await supabase
    .from('api_keys')
    .update({ brdg_balance: newBalance })
    .eq('api_key', apiKey);

  if (updateErr) throw new Error('Failed to add credits: ' + updateErr.message);

  return {
    success: true,
    new_balance: newBalance,
  };
}

/**
 * Deduct BRDG credits from a key (per-call cost).
 * @param {string} apiKey
 * @param {number} amount - defaults to 1
 * @returns {Promise<{ success: boolean, new_balance: number }>}
 */
async function deductCredit(apiKey, amount) {
  if (!amount) amount = 1;
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('amount must be a positive number');
  }

  const { data: row, error } = await supabase
    .from('api_keys')
    .select('brdg_balance')
    .eq('api_key', apiKey)
    .single();

  if (error || !row) throw new Error('API key not found');

  if (row.brdg_balance < amount) {
    const err = new Error('Insufficient BRDG balance');
    err.code = 'INSUFFICIENT_BALANCE';
    err.balance = row.brdg_balance;
    throw err;
  }

  const newBalance = row.brdg_balance - amount;
  const { error: updateErr } = await supabase
    .from('api_keys')
    .update({ brdg_balance: newBalance })
    .eq('api_key', apiKey);

  if (updateErr) throw new Error('Failed to deduct credit: ' + updateErr.message);

  return {
    success: true,
    new_balance: newBalance,
  };
}

/**
 * Reset daily call counters (run via cron at midnight).
 */
async function resetDailyCounts() {
  const { error } = await supabase
    .from('api_keys')
    .update({ calls_today: 0 })
    .neq('calls_today', 0);

  if (error) console.error('[api-keys] resetDailyCounts failed:', error.message);
}

module.exports = {
  createKey,
  validateKey,
  getUsage,
  addCredits,
  deductCredit,
  resetDailyCounts,
  PLANS,
};
