'use strict';
/**
 * tests/agent-crypto-wallet.test.js
 *
 * Unit tests for:
 *   - lib/digitaltwin-keystore.js  — deterministic ETH/BTC address derivation
 *   - lib/agent-crypto-registry.js — ensureWallet() idempotency & concurrent-call safety
 */

// ── Environment setup ─────────────────────────────────────────────────────────
// Use a fixed master secret so derivation is deterministic in CI.
const MASTER_SECRET = 'test-master-secret-at-least-32-characters-long';
process.env.BRIDGE_SIWE_JWT_SECRET = MASTER_SECRET;

// Stub out the treasury module so getEthWallet() doesn't fail on missing provider.
jest.mock('../lib/treasury', () => ({
  getProvider: () => null,
}), { virtual: true });

// Stub out Supabase so the registry uses only in-memory storage during tests.
jest.mock('../lib/supabase', () => ({
  supabase:     null,
  isConfigured: false,
}), { virtual: true });

const keystore = require('../lib/digitaltwin-keystore');
const registry = require('../lib/agent-crypto-registry');

// ── digitaltwin-keystore ──────────────────────────────────────────────────────

describe('digitaltwin-keystore — address derivation', () => {
  const AGENT_ID = 'prime-001';

  test('getEthAddress returns a valid checksummed 0x address', () => {
    const addr = keystore.getEthAddress(AGENT_ID);
    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  test('getBtcAddress returns a Base58Check mainnet address starting with "1"', () => {
    const addr = keystore.getBtcAddress(AGENT_ID);
    expect(addr).toMatch(/^1[1-9A-HJ-NP-Za-km-z]{25,34}$/);
  });

  test('getAddresses returns all three addresses without key material', () => {
    const result = keystore.getAddresses(AGENT_ID);
    expect(result.agentId).toBe(AGENT_ID);
    expect(result.eth).toBeDefined();
    expect(result.brdg).toBe(result.eth); // BRDG shares ETH address
    expect(result.btc).toBeDefined();
    // Ensure no private key is leaked
    expect(result).not.toHaveProperty('privateKey');
    expect(result).not.toHaveProperty('signingKey');
  });

  test('derivation is deterministic — same agentId yields same addresses', () => {
    const a1 = keystore.getAddresses(AGENT_ID);
    const a2 = keystore.getAddresses(AGENT_ID);
    expect(a1.eth).toBe(a2.eth);
    expect(a1.btc).toBe(a2.btc);
  });

  test('different agentIds yield different addresses', () => {
    const a1 = keystore.getAddresses('prime-001');
    const a2 = keystore.getAddresses('prime-002');
    expect(a1.eth).not.toBe(a2.eth);
    expect(a1.btc).not.toBe(a2.btc);
  });

  test('getEthWallet returns an object with address + signing methods but no privateKey', () => {
    const wallet = keystore.getEthWallet(AGENT_ID);
    expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(typeof wallet.signMessage).toBe('function');
    expect(typeof wallet.signTransaction).toBe('function');
    expect(typeof wallet.sendTransaction).toBe('function');
    // Private key must NOT be surfaced
    expect(wallet).not.toHaveProperty('privateKey');
    expect(wallet).not.toHaveProperty('signingKey');
  });

  test('getEthWallet address matches getEthAddress', () => {
    const wallet = keystore.getEthWallet(AGENT_ID);
    expect(wallet.address).toBe(keystore.getEthAddress(AGENT_ID));
  });

  test('throws a descriptive error when no master secret is configured', () => {
    const saved = process.env.BRIDGE_SIWE_JWT_SECRET;
    delete process.env.BRIDGE_SIWE_JWT_SECRET;
    delete process.env.BRIDGE_INTERNAL_SECRET;
    delete process.env.JWT_SECRET;

    // Clear the module cache so the next require re-evaluates with no env vars
    jest.resetModules();
    jest.mock('../lib/treasury', () => ({ getProvider: () => null }), { virtual: true });
    jest.mock('../lib/supabase', () => ({ supabase: null, isConfigured: false }), { virtual: true });

    const ks = require('../lib/digitaltwin-keystore');
    expect(() => ks.getEthAddress('agent-x')).toThrow(/BRIDGE_SIWE_JWT_SECRET/);
    expect(() => ks.getEthAddress('agent-x')).toThrow(/BRIDGE_INTERNAL_SECRET/);
    expect(() => ks.getEthAddress('agent-x')).toThrow(/JWT_SECRET/);

    // Restore
    process.env.BRIDGE_SIWE_JWT_SECRET = saved;
  });
});

// ── agent-crypto-registry ─────────────────────────────────────────────────────

describe('agent-crypto-registry — ensureWallet()', () => {
  beforeEach(() => {
    // Clear the in-memory store between tests by requiring the module fresh.
    // We do this via the module's exported API only (no direct _memStore access).
  });

  test('creates a wallet record with valid addresses', async () => {
    const record = await registry.ensureWallet('test-agent-001', 'Test Agent 001');
    expect(record).not.toBeNull();
    expect(record.agent_id).toBe('test-agent-001');
    expect(record.eth_address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(record.btc_address).toMatch(/^1[1-9A-HJ-NP-Za-km-z]{25,34}$/);
  });

  test('is idempotent — returns same record on repeated calls', async () => {
    const agentId = 'test-agent-idem-001';
    const r1 = await registry.ensureWallet(agentId, 'Idempotent Agent');
    const r2 = await registry.ensureWallet(agentId, 'Idempotent Agent');
    expect(r1.eth_address).toBe(r2.eth_address);
    expect(r1.btc_address).toBe(r2.btc_address);
  });

  test('concurrent calls do not create different records', async () => {
    const agentId = 'test-agent-concurrent-001';
    const [r1, r2, r3] = await Promise.all([
      registry.ensureWallet(agentId),
      registry.ensureWallet(agentId),
      registry.ensureWallet(agentId),
    ]);
    expect(r1.eth_address).toBe(r2.eth_address);
    expect(r1.eth_address).toBe(r3.eth_address);
    expect(r1.btc_address).toBe(r2.btc_address);
  });

  test('getWallet returns the record after ensureWallet', async () => {
    const agentId = 'test-agent-get-001';
    await registry.ensureWallet(agentId);
    const got = await registry.getWallet(agentId);
    expect(got).not.toBeNull();
    expect(got.agent_id).toBe(agentId);
  });

  test('getWallet returns null for an unknown agentId', async () => {
    const got = await registry.getWallet('totally-unknown-agent-xyz');
    expect(got).toBeNull();
  });

  test('returns null (not a null-address record) when master secret is missing', async () => {
    // Temporarily remove the secret
    const saved = process.env.BRIDGE_SIWE_JWT_SECRET;
    delete process.env.BRIDGE_SIWE_JWT_SECRET;
    delete process.env.BRIDGE_INTERNAL_SECRET;
    delete process.env.JWT_SECRET;

    jest.resetModules();
    jest.mock('../lib/treasury', () => ({ getProvider: () => null }), { virtual: true });
    jest.mock('../lib/supabase', () => ({ supabase: null, isConfigured: false }), { virtual: true });

    const reg = require('../lib/agent-crypto-registry');
    const result = await reg.ensureWallet('no-secret-agent');
    expect(result).toBeNull();

    // Restore
    process.env.BRIDGE_SIWE_JWT_SECRET = saved;
  });
});
