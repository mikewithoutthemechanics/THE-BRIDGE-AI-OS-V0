'use strict';
/**
 * Revenue E2E Test
 *
 * Proves the full payment chain:
 *   PayFast ITN  →  signature check  →  db.addToTreasury  →  logTransaction
 *                →  idempotency guard  →  brdg-distributor.distributeAmount
 *
 * Known gap (will fail until patched):
 *   The webhook handler never calls brdg-distributor.
 *   This test exposes that gap with a precise assertion failure.
 */

const http = require('http');
const supertest = require('supertest');

// ── Mock ALL external dependencies before api/index.js is loaded ──────────────
// Order matters — jest.mock() is hoisted, but explicit factories run in order.

jest.mock('../lib/supabase', () => ({
  supabase:      null,
  supabaseAnon:  null,
  isConfigured:  false,
}));

jest.mock('../lib/treasury', () => ({
  computeBuckets: jest.fn(() => ({ ops: 0, growth: 0, reserve: 0, founder: 0 })),
  getProvider:    jest.fn(() => ({})),
}));

jest.mock('../lib/db', () => ({
  getTreasuryBalance:  jest.fn(async () => 1000),
  addToTreasury:       jest.fn(async (amount) => 1000 + amount),
  logTransaction:      jest.fn(async () => ({ id: 'tx-test-1' })),
  isDuplicatePayment:  jest.fn(async () => false),
  getLeads:            jest.fn(async () => []),
  getContacts:         jest.fn(async () => []),
  getUsers:            jest.fn(async () => []),
  getWalletForUser:              jest.fn(async () => null),
  updateTransactionDistribution: jest.fn(async () => {}),
  getDistributionSummary:        jest.fn(async () => ({ payments: [], summary: {} })),
  query:                         jest.fn(async () => ({ rows: [] })),
  upsert:                        jest.fn(async () => ({})),
}));

jest.mock('../lib/payfast', () => ({
  verifyWebhook:    jest.fn(() => true),   // bypass MD5 check in all tests
  isSandbox:        jest.fn(() => true),   // skip live PayFast validation ping
  buildPaymentUrl:  jest.fn(() => ({
    url: 'https://sandbox.payfast.co.za/eng/process',
    fields: {},
    paymentId: 'test-payment-id',
    sandbox: true,
  })),
  generateSignature: jest.fn(() => 'test-sig'),
}));

jest.mock('../lib/brdg-distributor', () => ({
  distributeReward:    jest.fn(async () => ({ ok: true, txHash: '0xdeadbeef', amount: 50 })),
  distributeAmount:    jest.fn(async () => ({ ok: true, txHash: '0xdeadbeef', amount: 50 })),
  getTreasuryBalance:  jest.fn(async () => ({ ok: true, balance: '16000' })),
  batchDistribute:     jest.fn(async () => []),
  REWARD_RATES:        {},
}));

jest.mock('../lib/banks', () => ({
  splitPayment:         jest.fn(async () => ({})),
  getBankAccounts:      jest.fn(async () => []),
  seedBanksIfEmpty:     jest.fn(async () => {}),
  getAllBanks:          jest.fn(async () => []),
  getBank:             jest.fn(async () => null),
  creditBank:          jest.fn(async () => ({})),
  debitBank:           jest.fn(async () => ({})),
  compoundAll:         jest.fn(async () => ({})),
  registerPartnerBank: jest.fn(async () => ({})),
  getBankHistory:      jest.fn(async () => []),
}));

jest.mock('../lib/notify', () => ({
  alertPayment: jest.fn(async () => {}),
  send:         jest.fn(async () => {}),
  sendTelegram: jest.fn(async () => {}),
}));

jest.mock('../lib/proof-store', () => ({
  recordPayment: jest.fn(async () => ({})),
  verifyPayment: jest.fn(async () => ({ verified: true })),
  getPaymentProofs: jest.fn(async () => []),
}));

jest.mock('../lib/agents', () => ({
  runAgent:     jest.fn(async () => ({ ok: true, result: 'mock' })),
  listAgents:   jest.fn(() => []),
  getStatus:    jest.fn(() => ({})),
}));

jest.mock('../lib/mail', () => ({
  sendCampaignEmail: jest.fn(async () => ({})),
  sendEmail:         jest.fn(async () => ({})),
}));

// ── Noops for remaining top-level requires in api/index.js ───────────────────
jest.mock('../lib/directadmin',   () => ({ getStatus: jest.fn(), createAccount: jest.fn() }));
jest.mock('../lib/infra-feedback',() => ({ logFeedback: jest.fn(), getHealth: jest.fn() }));
jest.mock('../lib/wordpress',     () => ({ getStatus: jest.fn(), syncData: jest.fn() }));
jest.mock('../lib/zero-trust',    () => ({ verify: jest.fn(), sign: jest.fn() }));
jest.mock('../lib/chain-verify',  () => ({ verify: jest.fn() }));
jest.mock('../lib/migrate-zero-trust', () => ({ ensureTables: jest.fn(async () => {}) }));
jest.mock('../lib/reward-distributor', () => ({
  distribute: jest.fn(async () => ({})),
  getStats:   jest.fn(async () => ({})),
}));
jest.mock('../lib/user-identity', () => ({
  getUserByEmail: jest.fn(async () => ({ id: 'user-test-1', email: 'test@bridgeai.co.za' })),
  getUserWallets: jest.fn(async () => [{ wallet_address: '0xTestWallet1234567890123456789012345678' }]),
  createUser:     jest.fn(async () => ({})),
  getUserById:    jest.fn(async () => null),
  linkWallet:     jest.fn(async () => ({})),
}));

// ── Sub-router mocks (api/index.js does require('./platform') etc.) ───────────
jest.mock('../api/neurolink/cron-handlers', () => ({
  handleNeurolink: jest.fn(async () => false),
}));
jest.mock('../api/platform', () => ({
  handlePlatform: jest.fn(async () => false),
}));
jest.mock('../api/twin', () => ({
  handleTwin: jest.fn(async () => false),
}));
jest.mock('../api/siwe', () => ({
  handleSiwe: jest.fn(async () => false),
}));
jest.mock('../api/hitl', () => ({
  handleHitl: jest.fn(async () => false),
}));
jest.mock('../api/pipeline', () => ({
  handlePipeline: jest.fn(async () => false),
}));
jest.mock('../api/crm/routes', () => ({
  handleCRM: jest.fn(async () => false),
}));
jest.mock('../api/corporate/routes', () => ({
  handleCorporate: jest.fn(async () => false),
}));
jest.mock('../api/esim/routes', () => ({
  handleESim: jest.fn(async () => false),
}));

// ── Load handler AFTER all mocks are registered ──────────────────────────────
const handler     = require('../api/index');
const db          = require('../lib/db');
const distributor = require('../lib/brdg-distributor');
const pf          = require('../lib/payfast');

// ── Build supertest agent once per suite ─────────────────────────────────────
// api/index.js calls res.status(N).end() — Vercel-style chaining.
// Raw http.ServerResponse has no .status(); add it as a shim.
let server;
let request;

beforeAll(() => {
  server = http.createServer((req, res) => {
    if (!res.status) {
      res.status = (code) => { res.statusCode = code; return res; };
    }
    if (!res.json) {
      res.json = (body) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(body));
      };
    }
    return handler(req, res);
  });
  request = supertest(server);
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  jest.clearAllMocks();
  // Default: valid signature, sandbox mode, first-time payment
  pf.verifyWebhook.mockReturnValue(true);
  pf.isSandbox.mockReturnValue(true);
  db.isDuplicatePayment.mockResolvedValue(false);
  db.addToTreasury.mockImplementation(async (amount) => 1000 + amount);
  db.logTransaction.mockResolvedValue({ id: 'tx-test-1' });
});

// ── ITN payload builder ───────────────────────────────────────────────────────
function buildITN(overrides = {}) {
  return {
    merchant_id:     'test-merchant',
    merchant_key:    'test-key',
    m_payment_id:    'itn-001',
    pf_payment_id:   'pf-001',
    payment_status:  'COMPLETE',
    item_name:       'Bridge AI OS Pro',
    amount_gross:    '1499.00',
    amount_fee:      '-29.98',
    amount_net:      '1469.02',
    email_address:   'test@bridgeai.co.za',
    name_first:      'Test',
    name_last:       'User',
    custom_str1:     'pro',
    signature:       'mock-sig', // ignored — verifyWebhook is mocked
    ...overrides,
  };
}

// =============================================================================
// TEST 1 — Happy Path
// =============================================================================
describe('PayFast ITN happy path', () => {
  it('processes ITN → credits treasury → logs transaction', async () => {
    const itn = buildITN();

    const res = await request
      .post('/api/payfast-webhook')
      .send(itn);

    expect(res.status).toBe(200);

    // Treasury must be credited with the exact gross amount
    expect(db.addToTreasury).toHaveBeenCalledTimes(1);
    expect(db.addToTreasury).toHaveBeenCalledWith(
      1499,
      expect.stringContaining('PayFast:itn-001'),
    );

    // Transaction must be logged with matching idempotency key
    expect(db.logTransaction).toHaveBeenCalledTimes(1);
    expect(db.logTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1499,
        status: 'success',
        idempotencyKey: 'itn-001',
      }),
    );
  });

  it('triggers BRDG distribution after payment', async () => {
    const itn = buildITN({ amount_gross: '1499.00', email_address: 'test@bridgeai.co.za' });

    await request
      .post('/api/payfast-webhook')
      .send(itn);

    // Distribution is fire-and-forget — flush pending microtasks before asserting
    await new Promise(r => setImmediate(r));

    // distributeAmount OR distributeReward must be called once
    const called =
      distributor.distributeAmount.mock.calls.length +
      distributor.distributeReward.mock.calls.length;

    expect(called).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// TEST 2 — Idempotency
// =============================================================================
describe('Idempotency guard', () => {
  it('does not double-process a duplicate ITN', async () => {
    const itn = buildITN({ m_payment_id: 'dupe-001' });

    // First call: fresh payment
    db.isDuplicatePayment.mockResolvedValueOnce(false);
    await request.post('/api/payfast-webhook').type('form').send(itn);

    expect(db.addToTreasury).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    pf.verifyWebhook.mockReturnValue(true);
    pf.isSandbox.mockReturnValue(true);

    // Second call: duplicate
    db.isDuplicatePayment.mockResolvedValueOnce(true);
    const res = await request.post('/api/payfast-webhook').type('form').send(itn);

    expect(res.status).toBe(200); // 200 so PayFast stops retrying
    expect(db.addToTreasury).not.toHaveBeenCalled();
    expect(db.logTransaction).not.toHaveBeenCalled();
  });
});

// =============================================================================
// TEST 3 — Invalid Signature
// =============================================================================
describe('Signature validation', () => {
  it('rejects ITN with invalid signature — no treasury change, no distribution', async () => {
    pf.verifyWebhook.mockReturnValue(false); // simulate bad signature

    const itn = buildITN({ signature: 'wrong-sig' });

    const res = await request
      .post('/api/payfast-webhook')
      .send(itn);

    expect(res.status).toBe(400);
    expect(db.addToTreasury).not.toHaveBeenCalled();
    expect(db.logTransaction).not.toHaveBeenCalled();
    expect(distributor.distributeAmount).not.toHaveBeenCalled();
    expect(distributor.distributeReward).not.toHaveBeenCalled();
  });
});
