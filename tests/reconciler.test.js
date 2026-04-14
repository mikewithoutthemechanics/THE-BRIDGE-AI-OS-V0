'use strict';
/**
 * Reconciler Tests
 *
 * Tests the economic reconciliation layer: treasury DB parity + chain distribution parity.
 * No real DB or chain calls — all external dependencies are mocked.
 */

jest.mock('../lib/db', () => ({
  reconcileTreasury:        jest.fn(),
  getDistributionSummary:   jest.fn(),
  updateTransactionDistribution: jest.fn(async () => {}),
}));

jest.mock('../lib/brdg-distributor', () => ({
  getTreasuryBalance: jest.fn(),
  distributeAmount:   jest.fn(),
}));

jest.mock('../lib/brdg-chain', () => ({
  getTokenStats:   jest.fn(),
  getBRDGBalance:  jest.fn(),
}));

const db          = require('../lib/db');
const distributor = require('../lib/brdg-distributor');
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
// recoverMissed() — dry-run scaffold
// =============================================================================
describe('recoverMissed()', () => {
  it('returns a dry-run entry for each recoverable payment', async () => {
    const recoverable = [
      { idempotency_key: 'pay-fail', amount: 300, distribution_wallet: '0xBad', distribution_status: 'failed' },
      { idempotency_key: 'pay-old',  amount: 200, distribution_wallet: null,    distribution_status: null },
    ];

    const plan = await recoverMissed(recoverable);

    expect(plan).toHaveLength(2);
    expect(plan[0].idempotency_key).toBe('pay-fail');
    expect(plan[0].brdg_expected).toBe(300 * BRDG_PER_ZAR);
    expect(plan[1].prior_status).toBe('untracked');
    // Dry-run: no actual distribution called
    expect(distributor.distributeAmount).not.toHaveBeenCalled();
  });
});
