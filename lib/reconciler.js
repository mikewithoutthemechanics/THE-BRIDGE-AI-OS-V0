'use strict';
/**
 * Economic Reconciliation Layer
 *
 * Answers: are the DB treasury and on-chain BRDG wallet in agreement?
 *
 * Two independent checks:
 *   1. DB parity   — system_state.treasuryBalance ≈ SUM(transactions.amount) + seed
 *   2. Chain parity — expected BRDG distributed ≈ confirmed BRDG logged in distribution records
 *
 * The two are related by BRDG_PER_ZAR: every R1 received should produce 1 BRDG distributed.
 * That rate is stored as a named constant here — change it in one place when tokenomics shift.
 */

const db          = require('./db');
const distributor  = require('./brdg-distributor');

// ── Economic constants ────────────────────────────────────────────────────────
const BRDG_PER_ZAR               = 1; // 1 BRDG per R1 ZAR received
const CHAIN_DRIFT_TOLERANCE_BRDG = 1; // 1 BRDG acceptable chain drift

// ── 1. DB Parity ─────────────────────────────────────────────────────────────

/**
 * Compare the cached treasury balance in system_state against the
 * recomputed value from SUM(transactions). Delegates to db.reconcileTreasury().
 *
 * @returns {{ ok, cached, computed, drift, driftPct, txCount, error? }}
 */
async function checkDBParity() {
  return db.reconcileTreasury();
}

// ── 2. Chain Parity ───────────────────────────────────────────────────────────

/**
 * Compare expected BRDG out (from payment records × BRDG_PER_ZAR)
 * against confirmed BRDG out (from distribution_status='confirmed' records).
 *
 * Does NOT read live chain balance — chain balance changes with every
 * distribution and we don't know the starting balance. Instead we rely
 * on the audit trail written back by the webhook handler.
 *
 * @returns {{
 *   ok: boolean,
 *   expected_brdg: number,
 *   confirmed_brdg: number,
 *   drift: number,
 *   pending: number,
 *   failed: number,
 *   untracked: number,
 *   skipped: number,
 *   recoverable: Array,   — payments that need re-distribution (failed + untracked)
 *   chain_balance?: string, — live on-chain BRDG balance of treasury wallet (best-effort)
 *   error?: string
 * }}
 */
async function checkChainParity() {
  const [summaryResult, chainBalResult] = await Promise.allSettled([
    db.getDistributionSummary(),
    distributor.getTreasuryBalance(),
  ]);

  const summaryFailed = summaryResult.status === 'rejected';
  const { payments = [], summary = {}, error: dbErr } = summaryFailed
    ? { error: summaryResult.reason?.message }
    : summaryResult.value;

  const chainBalance = chainBalResult.status === 'fulfilled' && chainBalResult.value.ok
    ? chainBalResult.value.balance
    : null;

  const { expected_brdg = 0, confirmed_brdg = 0, pending = 0, failed = 0, untracked = 0 } = summary;

  // Skipped = user had no wallet — not a fault, not counted in drift
  const skipped = payments.filter(p => p.distribution_status === 'skipped').length;

  // Drift = BRDG we expected to send but haven't confirmed yet
  // (pending + failed + untracked payments represent potential drift)
  const drift = +(expected_brdg - confirmed_brdg).toFixed(2);

  // Recoverable = payments where distribution can be retried
  // failed: distribution was attempted but errored
  // untracked: webhook fired before audit trail existed (before this migration)
  const recoverable = payments.filter(p =>
    p.distribution_status === 'failed' ||
    p.distribution_status === null ||
    p.distribution_status === undefined
  );

  const ok = !summaryFailed && Math.abs(drift) <= CHAIN_DRIFT_TOLERANCE_BRDG;

  return {
    ok,
    expected_brdg,
    confirmed_brdg,
    drift,
    drift_tolerance: CHAIN_DRIFT_TOLERANCE_BRDG,
    brdg_per_zar: BRDG_PER_ZAR,
    pending,
    failed,
    untracked,
    skipped,
    total_payments: payments.length,
    recoverable,
    chain_balance: chainBalance,
    ...(dbErr ? { error: dbErr } : {}),
  };
}

// ── 3. Recovery ───────────────────────────────────────────────────────────────

/**
 * Re-trigger BRDG distribution for payments that have no confirmed distribution.
 *
 * Called with the `recoverable` array from checkChainParity().
 * Each entry has: { idempotency_key, amount, distribution_wallet, ... }
 *
 * Returns an array of { idempotency_key, result } objects.
 *
 * ── Your implementation choice ──────────────────────────────────────────────
 * This function is intentionally left for you to implement.
 * The critical decision: should recovery be automatic or gated?
 *
 * Option A — Silent auto-recovery:
 *   For each recoverable payment, look up the wallet and call distributeAmount.
 *   Fast, no human needed, but a bug in wallet resolution could send to wrong address.
 *
 * Option B — HITL-gated recovery:
 *   Insert each recoverable payment into the HITL queue (api/hitl.js already exists).
 *   A human approves each batch before tokens are sent.
 *   Slower, but appropriate for large amounts or untrusted wallet data.
 *
 * The `recoverable` entries already have distribution_wallet if a previous attempt
 * stored it (failed status). For untracked entries, wallet must be re-resolved
 * via userIdentity.getUserByEmail → getUserWallets.
 *
 * @param {Array<{ idempotency_key, amount, distribution_wallet, distribution_status }>} recoverable
 * @returns {Promise<Array<{ idempotency_key, result }>>}
 */
async function recoverMissed(recoverable) {
  // TODO: implement recovery strategy
  // Starter: return a dry-run report so you can see what would be recovered
  return recoverable.map(p => ({
    idempotency_key: p.idempotency_key,
    amount_zar:      p.amount,
    brdg_expected:   +(parseFloat(p.amount || 0) * BRDG_PER_ZAR).toFixed(2),
    wallet:          p.distribution_wallet || null,
    prior_status:    p.distribution_status || 'untracked',
    action:          'dry_run — implement recoverMissed() to send',
  }));
}

// ── 4. Full reconciliation report ────────────────────────────────────────────

/**
 * Run both checks and return a unified report.
 * This is what /api/treasury/reconcile returns.
 *
 * @returns {{
 *   ok: boolean,          — true only if BOTH checks pass
 *   db:    DBParityResult,
 *   chain: ChainParityResult,
 *   ts:    string
 * }}
 */
async function reconcile() {
  const [db_result, chain_result] = await Promise.all([
    checkDBParity().catch(e => ({ ok: false, error: e.message })),
    checkChainParity().catch(e => ({ ok: false, error: e.message })),
  ]);

  return {
    ok:    db_result.ok && chain_result.ok,
    db:    db_result,
    chain: chain_result,
    ts:    new Date().toISOString(),
  };
}

module.exports = { checkDBParity, checkChainParity, recoverMissed, reconcile, BRDG_PER_ZAR };
