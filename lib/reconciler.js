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
const hitlQueue    = require('./hitl-queue');

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

// ── Failure classifier ────────────────────────────────────────────────────────

/**
 * Return a machine-readable reason code for why a distribution needs recovery.
 * Used as the HITL queue `reason` field so reviewers know what they're approving.
 *
 * @param {{ txHash, attempts, email }} m
 * @returns {string}
 */
function classifyFailure(m) {
  if (!m.email)                         return 'MISSING_IDENTITY';
  if (m.txHash)                         return 'CHAIN_UNVERIFIED';   // tx exists but unconfirmed
  if (!m.txHash && m.attempts >= 3)     return 'RETRY_EXCEEDED';
  return 'UNKNOWN';
}

// ── Recovery ─────────────────────────────────────────────────────────────────

/**
 * Hybrid recovery: auto-retry safe cases, escalate ambiguous ones to HITL.
 *
 * Safe to auto-retry when ALL conditions hold:
 *   - attempts < 3         (not exhausted)
 *   - no txHash on record  (no ambiguous partial-send state)
 *   - wallet resolves      (we know where to send)
 *   - brdgAmount > 0       (nothing to send otherwise)
 *
 * Escalate to HITL when any condition fails — a human must review.
 *
 * Idempotency: every distribution call uses `recovery:${paymentId}` as memo.
 * The distributor rejects or returns the existing txHash for duplicate refs.
 *
 * @param {{ dryRun?: boolean }} opts
 * @returns {Promise<{ status, total, autoRetry, escalated, skipped, details }>}
 */
async function recoverMissed({ dryRun = true } = {}) {
  const missed = await db.getMissedDistributions();

  const result = {
    status:    'OK',
    dryRun,
    total:     missed.length,
    autoRetry: 0,
    escalated: 0,
    skipped:   0,
    details:   [],
  };

  for (const m of missed) {
    // Resolve wallet — use stored address if available, otherwise re-derive from email
    const wallet = m.distribution_wallet || await db.getWalletForUser(m.email);

    const safeToRetry =
      m.attempts < 3    &&
      !m.txHash         &&
      !!wallet          &&
      m.brdgAmount > 0;

    if (safeToRetry) {
      result.autoRetry++;
      result.details.push({
        paymentId:  m.paymentId,
        action:     dryRun ? 'would_auto_retry' : 'auto_retry',
        brdg:       m.brdgAmount,
        wallet,
        attempts:   m.attempts,
      });

      if (dryRun) continue;

      try {
        const tx = await distributor.distributeAmount(
          wallet,
          m.brdgAmount,
          `recovery:${m.paymentId}`,   // idempotency ref
        );
        await db.markDistributed(m.paymentId, tx.txHash);
        result.details.at(-1).txHash = tx.txHash;
        result.details.at(-1).outcome = 'confirmed';
      } catch (err) {
        await db.incrementAttempts(m.paymentId, err.message);
        result.details.at(-1).outcome = 'retry_failed';
        result.details.at(-1).error   = err.message;
      }

    } else {
      const reason = classifyFailure(m);
      result.escalated++;
      result.details.push({
        paymentId: m.paymentId,
        action:    dryRun ? 'would_escalate' : 'escalated',
        reason,
        brdg:      m.brdgAmount,
        wallet:    wallet || null,
        attempts:  m.attempts,
      });

      if (dryRun) continue;

      await hitlQueue.enqueue({
        type:      'REVENUE_RECOVERY',
        paymentId: m.paymentId,
        email:     m.email,
        amount:    m.brdgAmount,
        reason,
        meta:      { attempts: m.attempts, txHash: m.txHash || null },
      });
    }
  }

  return result;
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
