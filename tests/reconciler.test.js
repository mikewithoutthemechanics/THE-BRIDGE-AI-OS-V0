'use strict';
/**
 * Reconciler Tests
 *
 * Tests the economic reconciliation layer: treasury DB parity + chain distribution parity.
 * No real DB or chain calls — all external dependencies are mocked.
 */

jest.mock('../lib/db', () => ({
  reconcileTreasury:             jest.fn(),
  getDistributionSummary:        jest.fn(),
  updateTransactionDistribution: jest.fn(async () => {}),
  getMissedDistributions:        jest.fn(async () => []),
  getWalletForUser:              jest.fn(async () => null),
  markDistributed:               jest.fn(async () => {}),
  incrementAttempts:             jest.fn(async () => {}),
}));

jest.mock('../lib/brdg-distributor', () => ({
  getTreasuryBalance: jest.fn(),
  distributeAmount:   jest.fn(),
}));

jest.mock('../lib/brdg-chain', () => ({
  getTokenStats:   jest.fn(),
  getBRDGBalance:  jest.fn(),
}));

jest.mock('../lib/hitl-queue', () => ({
  enqueue: jest.fn(async () => ({ ok: true, id: 'hitl-001' })),
  list:    jest.fn(async () => []),
  resolve: jest.fn(async () => {}),
}));

const db          = require('../lib/db');
const distributor = require('../lib/brdg-distributor');
const hitlQueue   = require('../lib/hitl-queue');
const { checkDBParity, checkChainParity, reconcile, recoverMissed, BRDG_PER_ZAR } = require('../lib/reconciler');

beforeEach(() => jest.clearAllMocks());

// =============================================================================
// BRDG_PER_ZAR constant
// =============================================================================
describe('BRDG_PER_ZAR', () => {
  it('is 1 (deterministic, easy to audit)', () => {
    expect(BRDG_PER_ZAR).toBe(1);
  });
});

// =============================================================================
// DB Parity
// =============================================================================
describe('checkDBParity()', () => {
  it('delegates directly to db.reconcileTreasury', async () => {
    db.reconcileTreasury.mockResolvedValue({ ok: true, cached: 5000, computed: 5000, drift: 0, driftPct: 0, txCount: 3 });

    const result = await checkDBParity();

    expect(db.reconcileTreasury).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.drift).toBe(0);
  });

  it('surfaces drift when cached ≠ computed', async () => {
    db.reconcileTreasury.mockResolvedValue({ ok: false, cached: 5000, computed: 4999, drift: 1, driftPct: 0.02, txCount: 3 });

    const result = await checkDBParity();

    expect(result.ok).toBe(false);
    expect(result.drift).toBe(1);
  });
});

// =============================================================================
// Chain Parity
// =============================================================================
describe('checkChainParity()', () => {
  function makePayments(overrides = []) {
    // Default: 2 confirmed payments, no drift
    return [
      { idempotency_key: 'pay-001', amount: 500, distribution_status: 'confirmed', distribution_brdg: 500, distribution_wallet: '0xWallet1' },
      { idempotency_key: 'pay-002', amount: 999, distribution_status: 'confirmed', distribution_brdg: 999, distribution_wallet: '0xWallet2' },
      ...overrides,
    ];
  }

  it('reports ok=true when all payments are confirmed and drift is zero', async () => {
    db.getDistributionSummary.mockResolvedValue({
      payments: makePayments(),
      summary:  { expected_brdg: 1499, confirmed_brdg: 1499, pending: 0, failed: 0, untracked: 0 },
    });
    distributor.getTreasuryBalance.mockResolvedValue({ ok: true, balance: '14625.92' });

    const result = await checkChainParity();

    expect(result.ok).toBe(true);
    expect(result.drift).toBe(0);
    expect(result.recoverable).toHaveLength(0);
    expect(result.chain_balance).toBe('14625.92');
  });

  it('detects drift when confirmed_brdg < expected_brdg', async () => {
    db.getDistributionSummary.mockResolvedValue({
      payments: makePayments([
        { idempotency_key: 'pay-003', amount: 300, distribution_status: 'failed', distribution_brdg: 0, distribution_wallet: '0xWallet3' },
      ]),
      summary: { expected_brdg: 1799, confirmed_brdg: 1499, pending: 0, failed: 1, untracked: 0 },
    });
    distributor.getTreasuryBalance.mockResolvedValue({ ok: true, balance: '14625.92' });

    const result = await checkChainParity();

    expect(result.ok).toBe(false);
    expect(result.drift).toBe(300);
    expect(result.failed).toBe(1);
    expect(result.recoverable).toHaveLength(1);
    expect(result.recoverable[0].idempotency_key).toBe('pay-003');
  });

  it('flags untracked payments (no distribution record) as recoverable', async () => {
    db.getDistributionSummary.mockResolvedValue({
      payments: makePayments([
        { idempotency_key: 'pay-old', amount: 200, distribution_status: null, distribution_brdg: null, distribution_wallet: null },
      ]),
      summary: { expected_brdg: 1699, confirmed_brdg: 1499, pending: 0, failed: 0, untracked: 1 },
    });
    distributor.getTreasuryBalance.mockResolvedValue({ ok: false, reason: 'not_configured' });

    const result = await checkChainParity();

    expect(result.untracked).toBe(1);
    expect(result.recoverable).toHaveLength(1);
    expect(result.chain_balance).toBeNull();  // graceful when chain is unavailable
  });

  it('does NOT count skipped payments in drift (user had no wallet)', async () => {
    db.getDistributionSummary.mockResolvedValue({
      payments: makePayments([
        { idempotency_key: 'pay-nowallet', amount: 100, distribution_status: 'skipped', distribution_brdg: 0, distribution_wallet: null },
      ]),
      // skipped payments ARE in expected_brdg (they paid real money) — that's by design
      summary: { expected_brdg: 1599, confirmed_brdg: 1499, pending: 0, failed: 0, untracked: 0 },
    });
    distributor.getTreasuryBalance.mockResolvedValue({ ok: true, balance: '14625.92' });

    const result = await checkChainParity();

    expect(result.skipped).toBe(1);
    // skipped ≠ recoverable — we can't send to a wallet that doesn't exist
    expect(result.recoverable).toHaveLength(0);
  });

  it('handles DB error gracefully — ok=false, error surfaced', async () => {
    db.getDistributionSummary.mockRejectedValue(new Error('Supabase timeout'));
    distributor.getTreasuryBalance.mockResolvedValue({ ok: true, balance: '100' });

    const result = await checkChainParity();

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timeout/i);
  });
});

// =============================================================================
// Full reconcile()
// =============================================================================
describe('reconcile()', () => {
  it('ok=true only when both DB and chain checks pass', async () => {
    db.reconcileTreasury.mockResolvedValue({ ok: true, drift: 0 });
    db.getDistributionSummary.mockResolvedValue({
      payments: [],
      summary: { expected_brdg: 0, confirmed_brdg: 0, pending: 0, failed: 0, untracked: 0 },
    });
    distributor.getTreasuryBalance.mockResolvedValue({ ok: true, balance: '16000' });

    const result = await reconcile();

    expect(result.ok).toBe(true);
    expect(result.db).toBeDefined();
    expect(result.chain).toBeDefined();
    expect(result.ts).toBeDefined();
  });

  it('ok=false when DB check fails even if chain is fine', async () => {
    db.reconcileTreasury.mockResolvedValue({ ok: false, drift: 5 });
    db.getDistributionSummary.mockResolvedValue({
      payments: [],
      summary: { expected_brdg: 0, confirmed_brdg: 0, pending: 0, failed: 0, untracked: 0 },
    });
    distributor.getTreasuryBalance.mockResolvedValue({ ok: true, balance: '16000' });

    const result = await reconcile();

    expect(result.ok).toBe(false);
    expect(result.db.ok).toBe(false);
    expect(result.chain.ok).toBe(true);
  });

  it('continues when one check throws — error isolated to that side', async () => {
    db.reconcileTreasury.mockRejectedValue(new Error('DB down'));
    db.getDistributionSummary.mockResolvedValue({
      payments: [],
      summary: { expected_brdg: 0, confirmed_brdg: 0, pending: 0, failed: 0, untracked: 0 },
    });
    distributor.getTreasuryBalance.mockResolvedValue({ ok: true, balance: '16000' });

    const result = await reconcile();

    expect(result.ok).toBe(false);
    expect(result.db.error).toMatch(/DB down/);
    expect(result.chain).toBeDefined(); // chain check still ran
  });
});

// =============================================================================
// recoverMissed()
// =============================================================================
describe('recoverMissed()', () => {
  // Convenience builder — only override what matters per test
  function missedPayment(overrides = {}) {
    return {
      paymentId:            'pay-001',
      email:                'user@test.com',
      brdgAmount:           500,
      txHash:               null,
      distribution_status:  'failed',
      distribution_wallet:  '0xWallet123',
      attempts:             0,
      ...overrides,
    };
  }

  it('dry-run: reports would_auto_retry without calling distributor', async () => {
    db.getMissedDistributions.mockResolvedValue([
      missedPayment({ paymentId: 'pay-safe', attempts: 0, txHash: null, brdgAmount: 300 }),
    ]);

    const result = await recoverMissed({ dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.autoRetry).toBe(1);
    expect(result.escalated).toBe(0);
    expect(result.details[0].action).toBe('would_auto_retry');
    expect(result.details[0].paymentId).toBe('pay-safe');
    expect(distributor.distributeAmount).not.toHaveBeenCalled();
    expect(hitlQueue.enqueue).not.toHaveBeenCalled();
  });

  it('dry-run: escalates when attempts >= 3 (retry exhausted)', async () => {
    db.getMissedDistributions.mockResolvedValue([
      missedPayment({ paymentId: 'pay-exhausted', attempts: 3, txHash: null }),
    ]);

    const result = await recoverMissed({ dryRun: true });

    expect(result.escalated).toBe(1);
    expect(result.details[0].action).toBe('would_escalate');
    expect(result.details[0].reason).toBe('RETRY_EXCEEDED');
    expect(hitlQueue.enqueue).not.toHaveBeenCalled(); // dry-run, no side effects
  });

  it('dry-run: escalates when txHash exists (ambiguous partial-send)', async () => {
    db.getMissedDistributions.mockResolvedValue([
      missedPayment({ txHash: '0xPartial', attempts: 1 }),
    ]);

    const result = await recoverMissed({ dryRun: true });

    expect(result.escalated).toBe(1);
    expect(result.details[0].reason).toBe('CHAIN_UNVERIFIED');
  });

  it('dry-run: escalates when wallet cannot be resolved', async () => {
    db.getMissedDistributions.mockResolvedValue([
      missedPayment({ distribution_wallet: null }),
    ]);
    db.getWalletForUser.mockResolvedValue(null); // wallet lookup also fails

    const result = await recoverMissed({ dryRun: true });

    expect(result.escalated).toBe(1);
    expect(db.getWalletForUser).toHaveBeenCalledWith('user@test.com');
  });

  it('live: auto-retries safe payment and records txHash', async () => {
    db.getMissedDistributions.mockResolvedValue([
      missedPayment({ paymentId: 'pay-retry', attempts: 1, txHash: null, brdgAmount: 200 }),
    ]);
    distributor.distributeAmount.mockResolvedValue({ ok: true, txHash: '0xNewTx' });

    const result = await recoverMissed({ dryRun: false });

    expect(result.autoRetry).toBe(1);
    expect(distributor.distributeAmount).toHaveBeenCalledWith(
      '0xWallet123',
      200,
      'recovery:pay-retry',
    );
    expect(db.markDistributed).toHaveBeenCalledWith('pay-retry', '0xNewTx');
    expect(result.details[0].outcome).toBe('confirmed');
    expect(result.details[0].txHash).toBe('0xNewTx');
  });

  it('live: records retry_failed and increments attempts when distributor throws', async () => {
    db.getMissedDistributions.mockResolvedValue([
      missedPayment({ paymentId: 'pay-retry-fail', attempts: 0 }),
    ]);
    distributor.distributeAmount.mockRejectedValue(new Error('gas limit exceeded'));

    const result = await recoverMissed({ dryRun: false });

    expect(result.details[0].outcome).toBe('retry_failed');
    expect(db.incrementAttempts).toHaveBeenCalledWith('pay-retry-fail', 'gas limit exceeded');
    expect(db.markDistributed).not.toHaveBeenCalled();
  });

  it('live: enqueues HITL item for escalated payments', async () => {
    db.getMissedDistributions.mockResolvedValue([
      missedPayment({ paymentId: 'pay-hitl', attempts: 3, txHash: null }),
    ]);

    const result = await recoverMissed({ dryRun: false });

    expect(result.escalated).toBe(1);
    expect(hitlQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type:      'REVENUE_RECOVERY',
        paymentId: 'pay-hitl',
        reason:    'RETRY_EXCEEDED',
      }),
    );
  });

  it('resolves wallet from email when distribution_wallet is null', async () => {
    db.getMissedDistributions.mockResolvedValue([
      missedPayment({ distribution_wallet: null, attempts: 0, brdgAmount: 100 }),
    ]);
    db.getWalletForUser.mockResolvedValue('0xDerivedWallet');
    distributor.distributeAmount.mockResolvedValue({ ok: true, txHash: '0xDerived' });

    await recoverMissed({ dryRun: false });

    expect(distributor.distributeAmount).toHaveBeenCalledWith('0xDerivedWallet', 100, expect.any(String));
  });

  it('returns total=0 when no missed distributions exist', async () => {
    db.getMissedDistributions.mockResolvedValue([]);

    const result = await recoverMissed({ dryRun: true });

    expect(result.total).toBe(0);
    expect(result.autoRetry).toBe(0);
    expect(result.escalated).toBe(0);
    expect(result.details).toHaveLength(0);
  });
});
