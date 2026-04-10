/**
 * BRIDGE AI OS — Withdrawal Safety Middleware
 *
 * Rate limiting, daily caps, cooldowns, and large-withdrawal approval gates
 * for BRDG token withdrawals. Uses Supabase withdrawal_requests table.
 */

'use strict';

const { supabase, isConfigured } = require('./supabase');

// ---------------------------------------------------------------------------
// Constants (all overridable via env)
// ---------------------------------------------------------------------------
const DAILY_BRDG_LIMIT       = Number(process.env.WITHDRAWAL_DAILY_LIMIT) || 10000;
const LARGE_WITHDRAWAL_THRESHOLD = Number(process.env.WITHDRAWAL_LARGE_THRESHOLD) || 5000;
const COOLDOWN_MINUTES        = Number(process.env.WITHDRAWAL_COOLDOWN_MINUTES) || 10;
const MIN_WITHDRAWAL          = Number(process.env.WITHDRAWAL_MIN_AMOUNT) || 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** ISO string for midnight today (UTC) */
function todayStart() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Fetch today's non-failed withdrawals for a user.
 * Returns { rows, error } — rows may be [] on Supabase failure.
 */
async function fetchTodayWithdrawals(userId) {
  if (!isConfigured || !supabase) {
    console.warn('[withdrawal-limits] Supabase not configured — skipping DB check');
    return { rows: [], error: null, fallback: true };
  }

  const { data, error } = await supabase
    .from('withdrawal_requests')
    .select('amount, created_at')
    .eq('user_id', userId)
    .gte('created_at', todayStart())
    .neq('status', 'failed')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[withdrawal-limits] Supabase query error:', error.message);
    return { rows: [], error, fallback: true };
  }

  return { rows: data || [], error: null, fallback: false };
}

// ---------------------------------------------------------------------------
// getDailyUsage(userId)
// ---------------------------------------------------------------------------
async function getDailyUsage(userId) {
  const { rows, fallback } = await fetchTodayWithdrawals(userId);

  const daily_used = rows.reduce((sum, r) => sum + Number(r.amount), 0);
  const remaining  = Math.max(0, DAILY_BRDG_LIMIT - daily_used);
  const last_withdrawal_at = rows.length > 0 ? rows[0].created_at : null;

  return {
    daily_used,
    daily_limit: DAILY_BRDG_LIMIT,
    remaining,
    last_withdrawal_at,
    withdrawals_today: rows.length,
    _fallback: fallback,   // true when Supabase was unavailable
  };
}

// ---------------------------------------------------------------------------
// checkCooldown(userId)
// ---------------------------------------------------------------------------
async function checkCooldown(userId) {
  const { rows, fallback } = await fetchTodayWithdrawals(userId);

  if (fallback || rows.length === 0) {
    return { ok: true };
  }

  const lastAt    = new Date(rows[0].created_at);
  const now       = Date.now();
  const elapsed   = (now - lastAt.getTime()) / 1000;           // seconds
  const cooldownS = COOLDOWN_MINUTES * 60;

  if (elapsed < cooldownS) {
    return {
      ok: false,
      retry_after_seconds: Math.ceil(cooldownS - elapsed),
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// withdrawalGuard middleware
// ---------------------------------------------------------------------------
async function withdrawalGuard(req, res, next) {
  try {
    // 1. Auth check
    if (!req.user || !req.user.user_id) {
      return res.status(401).json({ ok: false, error: 'Authentication required' });
    }

    const userId = req.user.user_id;
    const amount = Number(req.body && req.body.amount);

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ ok: false, error: 'Invalid withdrawal amount' });
    }

    // 2. Minimum check
    if (amount < MIN_WITHDRAWAL) {
      return res.status(400).json({
        ok: false,
        error: `Minimum withdrawal is ${MIN_WITHDRAWAL} BRDG`,
        min_withdrawal: MIN_WITHDRAWAL,
      });
    }

    // 3. Daily limit check
    const usage = await getDailyUsage(userId);

    if (usage.daily_used + amount > DAILY_BRDG_LIMIT) {
      return res.status(429).json({
        ok: false,
        error: `Daily withdrawal limit of ${DAILY_BRDG_LIMIT} BRDG would be exceeded`,
        daily_limit: DAILY_BRDG_LIMIT,
        daily_used: usage.daily_used,
        remaining: usage.remaining,
      });
    }

    // 4. Cooldown check
    const cooldown = await checkCooldown(userId);

    if (!cooldown.ok) {
      return res.status(429).json({
        ok: false,
        error: `Please wait before next withdrawal`,
        retry_after_seconds: cooldown.retry_after_seconds,
      });
    }

    // 5. Large withdrawal flag (don't reject — let handler decide)
    if (amount >= LARGE_WITHDRAWAL_THRESHOLD) {
      req.requiresApproval = true;
    }

    // Attach usage info for downstream handlers
    req.withdrawalUsage = usage;

    next();
  } catch (err) {
    console.error('[withdrawal-limits] Guard error:', err.message);
    // Fail open with warning so users aren't locked out by infra issues
    console.warn('[withdrawal-limits] Allowing withdrawal due to guard error — manual review advised');
    next();
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  withdrawalGuard,
  getDailyUsage,
  checkCooldown,
  DAILY_BRDG_LIMIT,
  LARGE_WITHDRAWAL_THRESHOLD,
  COOLDOWN_MINUTES,
  MIN_WITHDRAWAL,
};
