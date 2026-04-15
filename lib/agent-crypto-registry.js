'use strict';
/**
 * AGENT CRYPTO WALLET REGISTRY
 * =============================
 * Maintains a registry of per-agent cryptocurrency wallet addresses.
 *
 * What is stored here:
 *   - Public wallet addresses only (ETH/BRDG on Linea, BTC mainnet)
 *   - Wallet creation timestamps and metadata
 *
 * What is NOT stored here:
 *   - Private keys (custodied exclusively by lib/digitaltwin-keystore.js)
 *
 * Storage:
 *   Primary   → Supabase table `agent_crypto_wallets`
 *   Fallback  → In-memory Map (data lost on restart — fine for dev)
 *
 * Auto-seeding:
 *   Call seedFromRegistry() on startup to ensure every agent in the
 *   agent-registry already has a wallet entry.
 */

let supabase = null;
try {
  supabase = require('./supabase').supabase;
} catch (_) {}

const keystore = require('./digitaltwin-keystore');

const TABLE = 'agent_crypto_wallets';

// ── In-memory fallback store ──────────────────────────────────────────────────
// Map<agentId, WalletRecord>
const _memStore = new Map();

// WalletRecord shape:
// {
//   agent_id   : string,
//   agent_name : string,
//   eth_address: string,   // also used for BRDG (ERC-20 on Linea)
//   btc_address: string,
//   created_at : ISO string,
//   updated_at : ISO string,
// }

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function _sbGet(agentId) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('agent_id', agentId)
      .single();
    if (error || !data) return null;
    return data;
  } catch (_) { return null; }
}

async function _sbUpsert(record) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from(TABLE).upsert(record, { onConflict: 'agent_id' });
    return !error;
  } catch (_) { return false; }
}

async function _sbGetAll() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: true });
    if (error || !data) return null;
    return data;
  } catch (_) { return null; }
}

// ── Core operations ───────────────────────────────────────────────────────────

/**
 * Ensure a wallet record exists for the given agent.
 * If one already exists, returns it unchanged (idempotent).
 * Called automatically on agent registration.
 *
 * @param {string} agentId   - canonical agent ID (e.g. "prime-001")
 * @param {string} [agentName] - human-readable name for display
 * @returns {Promise<WalletRecord>}
 */
async function ensureWallet(agentId, agentName = '') {
  // ── Helper: attempt to complete an incomplete record (null addresses) ────────
  async function _tryComplete(record) {
    if (record.eth_address && record.btc_address) return record;
    try {
      const addresses = keystore.getAddresses(agentId);
      const updated = {
        ...record,
        eth_address: addresses.eth,
        btc_address: addresses.btc,
        updated_at:  new Date().toISOString(),
      };
      await _sbUpsert(updated);
      _memStore.set(agentId, updated);
      return updated;
    } catch (_) {
      // Still cannot derive — return record as-is (incomplete)
      return record;
    }
  }

  // 1. Check Supabase
  const existing = await _sbGet(agentId);
  if (existing) {
    const completed = await _tryComplete(existing);
    _memStore.set(agentId, completed);
    return completed;
  }

  // 2. Check memory fallback
  if (_memStore.has(agentId)) {
    const cached = _memStore.get(agentId);
    return _tryComplete(cached);
  }

  // 3. Derive addresses (no private keys are accessed here)
  let addresses;
  try {
    addresses = keystore.getAddresses(agentId);
  } catch (err) {
    // Master secret not configured — do not create a placeholder record with null
    // addresses, as that would become permanent and block later re-derivation.
    console.warn(`[agent-crypto-registry] Cannot derive addresses for ${agentId}: ${err.message}`);
    return null;
  }

  const now = new Date().toISOString();
  const record = {
    agent_id:    agentId,
    agent_name:  agentName,
    eth_address: addresses.eth,
    btc_address: addresses.btc,
    created_at:  now,
    updated_at:  now,
  };

  // 4. Persist (upsert handles concurrent calls — no duplicate-key errors)
  const saved = await _sbUpsert(record);
  if (!saved) {
    console.warn(`[agent-crypto-registry] Supabase unavailable — using in-memory store for ${agentId}`);
  }
  _memStore.set(agentId, record);

  console.log(`[agent-crypto-registry] Wallet created for agent "${agentId}" → ETH: ${addresses.eth} | BTC: ${addresses.btc}`);
  return record;
}

/**
 * Get wallet record for a single agent (returns null if not found).
 * @param {string} agentId
 * @returns {Promise<WalletRecord|null>}
 */
async function getWallet(agentId) {
  const sb = await _sbGet(agentId);
  if (sb) { _memStore.set(agentId, sb); return sb; }
  return _memStore.get(agentId) ?? null;
}

/**
 * List all registered agent wallets.
 * @returns {Promise<WalletRecord[]>}
 */
async function getAllWallets() {
  const sb = await _sbGetAll();
  if (sb) {
    sb.forEach(r => _memStore.set(r.agent_id, r));
    return sb;
  }
  return [..._memStore.values()];
}

/**
 * Seed wallets for every agent already in the agent-registry.
 * Safe to call on every startup — skips agents that already have wallets.
 */
async function seedFromRegistry() {
  let registry = null;
  try { registry = require('./agent-registry'); } catch (_) { return; }

  let agents = [];
  try { agents = await registry.getAll(); } catch (_) { return; }

  let created = 0;
  for (const agent of agents) {
    const id   = agent.id   || agent.agent_id;
    const name = agent.name || agent.agent_name || '';
    if (!id) continue;
    const existing = await getWallet(id);
    if (!existing) {
      await ensureWallet(id, name);
      created++;
    }
  }

  if (created > 0) {
    console.log(`[agent-crypto-registry] Seeded ${created} new wallet(s) from agent-registry`);
  } else {
    console.log(`[agent-crypto-registry] All agents already have wallets (${agents.length} total)`);
  }
}

/**
 * Summary statistics.
 * @returns {Promise<{ total, withEth, withBtc, missingAddresses }>}
 */
async function getCryptoStats() {
  const wallets = await getAllWallets();
  return {
    total:            wallets.length,
    withEth:          wallets.filter(w => w.eth_address).length,
    withBtc:          wallets.filter(w => w.btc_address).length,
    missingAddresses: wallets.filter(w => !w.eth_address || !w.btc_address).length,
  };
}

module.exports = { ensureWallet, getWallet, getAllWallets, seedFromRegistry, getCryptoStats };
