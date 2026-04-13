'use strict';
/**
 * BRIDGE AI OS — Telecom Engine
 *
 * Core services for the federated carrier ecosystem:
 *   - Wallet operations (credit/debit/lock/release/transfer)
 *   - Reseller chain traversal + deterministic revenue distribution
 *   - Smart least-cost routing (LCR) across federation carriers
 *   - RBAC (root / master_reseller / reseller / tenant)
 */

const crypto = require('crypto');
const { supabase, isConfigured } = require('./supabase');

const ROOT_OWNER_ID = 'root';

// ── Wallet Operations ────────────────────────────────────────────────────────

async function getOrCreateWallet(ownerId, ownerType, currency = 'ZAR') {
  if (!isConfigured) return { id: null, balance: 0, reserved: 0 };
  const ownerStr = String(ownerId);

  const { data } = await supabase
    .from('pbx_wallets')
    .select('*')
    .eq('owner_id', ownerStr)
    .eq('owner_type', ownerType)
    .single();
  if (data) return data;

  const { data: created, error } = await supabase
    .from('pbx_wallets')
    .insert({ owner_id: ownerStr, owner_type: ownerType, currency })
    .select()
    .single();
  if (error) throw new Error('[wallet] create failed: ' + error.message);
  return created;
}

async function creditWallet(walletId, amount, reference, meta = {}) {
  if (!isConfigured || !walletId) return 0;
  const amt = Math.round(parseFloat(amount) * 10000) / 10000;

  const { data: w } = await supabase.from('pbx_wallets').select('balance').eq('id', walletId).single();
  if (!w) throw new Error('Wallet not found: ' + walletId);

  const newBalance = Math.round(((parseFloat(w.balance) || 0) + amt) * 10000) / 10000;
  await supabase.from('pbx_wallets').update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('id', walletId);
  await supabase.from('pbx_wallet_transactions').insert({ wallet_id: walletId, type: 'credit', amount: amt, balance_after: newBalance, reference, meta }).catch(() => {});
  return newBalance;
}

async function debitWallet(walletId, amount, reference, meta = {}) {
  if (!isConfigured || !walletId) return 0;
  const amt = Math.round(parseFloat(amount) * 10000) / 10000;

  const { data: w } = await supabase.from('pbx_wallets').select('balance, credit_line').eq('id', walletId).single();
  if (!w) throw new Error('Wallet not found: ' + walletId);

  const available = (parseFloat(w.balance) || 0) + (parseFloat(w.credit_line) || 0);
  if (available < amt) throw new Error('Insufficient balance');

  const newBalance = Math.round(((parseFloat(w.balance) || 0) - amt) * 10000) / 10000;
  await supabase.from('pbx_wallets').update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('id', walletId);
  await supabase.from('pbx_wallet_transactions').insert({ wallet_id: walletId, type: 'debit', amount: amt, balance_after: newBalance, reference, meta }).catch(() => {});
  return newBalance;
}

async function lockBalance(walletId, amount, reference) {
  if (!isConfigured || !walletId) return true;
  const amt = Math.round(parseFloat(amount) * 10000) / 10000;

  const { data: w } = await supabase.from('pbx_wallets').select('balance, reserved').eq('id', walletId).single();
  if (!w) throw new Error('Wallet not found');
  if ((parseFloat(w.balance) || 0) < amt) throw new Error('Insufficient balance to lock');

  await supabase.from('pbx_wallets').update({
    balance:  Math.round(((parseFloat(w.balance) || 0) - amt) * 10000) / 10000,
    reserved: Math.round(((parseFloat(w.reserved) || 0) + amt) * 10000) / 10000,
    updated_at: new Date().toISOString(),
  }).eq('id', walletId);
  await supabase.from('pbx_wallet_transactions').insert({ wallet_id: walletId, type: 'lock', amount: amt, reference }).catch(() => {});
  return true;
}

async function releaseBalance(walletId, amount, reference) {
  if (!isConfigured || !walletId) return true;
  const { data: w } = await supabase.from('pbx_wallets').select('balance, reserved').eq('id', walletId).single();
  if (!w) throw new Error('Wallet not found');

  const release = Math.min(parseFloat(amount), parseFloat(w.reserved) || 0);
  await supabase.from('pbx_wallets').update({
    balance:  Math.round(((parseFloat(w.balance) || 0) + release) * 10000) / 10000,
    reserved: Math.round(((parseFloat(w.reserved) || 0) - release) * 10000) / 10000,
    updated_at: new Date().toISOString(),
  }).eq('id', walletId);
  await supabase.from('pbx_wallet_transactions').insert({ wallet_id: walletId, type: 'release', amount: release, reference }).catch(() => {});
  return true;
}

async function transferWallet(fromWalletId, toWalletId, amount, reference) {
  if (!isConfigured) return true;
  const amt = Math.round(parseFloat(amount) * 10000) / 10000;
  await debitWallet(fromWalletId, amt, reference, { to_wallet: toWalletId, type: 'transfer_out' });
  await creditWallet(toWalletId, amt, reference, { from_wallet: fromWalletId, type: 'transfer_in' });
  return true;
}

// ── Reseller Chain + Revenue Distribution ────────────────────────────────────

async function getResellerChain(resellerId) {
  if (!isConfigured || !resellerId) return [];
  const chain = [];
  let currentId = resellerId;
  const visited = new Set();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const { data } = await supabase.from('pbx_resellers').select('*').eq('id', currentId).single();
    if (!data) break;
    chain.push(data);
    currentId = data.parent_id;
  }
  return chain; // [direct_reseller → L1_parent → ... → L0_root_reseller]
}

/**
 * Distribute revenue deterministically up the reseller chain.
 * Each level takes its revenue_share_pct of the remaining amount.
 * Whatever is left after all splits goes to the root wallet.
 */
async function distributeRevenue(amount, resellerId, reference) {
  if (!isConfigured) return { splits: [], root_amount: parseFloat(amount) };

  const chain = await getResellerChain(resellerId);
  const splits = [];
  let remaining = Math.round(parseFloat(amount) * 10000) / 10000;

  for (const reseller of chain) {
    if (!reseller.wallet_id || remaining <= 0) continue;

    const sharePct = parseFloat(reseller.markup_rules?.revenue_share_pct || 20) / 100;
    const cut = Math.round(remaining * sharePct * 10000) / 10000;
    if (cut <= 0) continue;

    await creditWallet(reseller.wallet_id, cut, reference, { source: 'revenue_split', level: reseller.level });
    splits.push({ reseller_id: reseller.id, level: reseller.level, amount: cut, wallet_id: reseller.wallet_id });
    remaining = Math.round((remaining - cut) * 10000) / 10000;
  }

  // Root absorbs remainder
  const rootWallet = await getOrCreateWallet(ROOT_OWNER_ID, 'root');
  if (rootWallet?.id && remaining > 0) {
    await creditWallet(rootWallet.id, remaining, reference, { source: 'root_revenue' });
  }

  await supabase.from('pbx_revenue_splits').insert({
    transaction_ref: reference,
    total_amount: parseFloat(amount),
    reseller_id: resellerId || null,
    splits,
    root_amount: remaining,
    status: 'completed',
  }).catch(() => {});

  return { splits, root_amount: remaining, total_distributed: parseFloat(amount) };
}

// ── Smart Least-Cost Routing (LCR) ───────────────────────────────────────────

async function routeCall(destination) {
  if (!isConfigured || !destination) return null;

  // Try prefixes from longest (most specific) to shortest
  for (let len = Math.min(destination.replace(/\s/g, '').length, 5); len >= 2; len--) {
    const prefix = destination.replace(/\s/g, '').slice(0, len);
    const { data } = await supabase
      .from('pbx_federation_carriers')
      .select('*')
      .eq('status', 'active')
      .contains('routes', JSON.stringify([prefix]));

    if (data?.length) {
      return data.sort((a, b) => {
        const cA = parseFloat(a.rates?.per_min ?? 999);
        const cB = parseFloat(b.rates?.per_min ?? 999);
        if (Math.abs(cA - cB) > 0.001) return cA - cB;
        if ((a.latency_ms || 999) !== (b.latency_ms || 999)) return (a.latency_ms || 999) - (b.latency_ms || 999);
        return (parseFloat(b.success_rate) || 0) - (parseFloat(a.success_rate) || 0);
      })[0];
    }
  }

  // Global fallback: highest-priority active carrier
  const { data: fallback } = await supabase
    .from('pbx_federation_carriers')
    .select('*')
    .eq('status', 'active')
    .order('priority', { ascending: true })
    .limit(1)
    .single();
  return fallback || null;
}

async function getAvailableRoutes(destination) {
  if (!isConfigured) return [];
  const dest = destination.replace(/\s/g, '');
  const { data } = await supabase.from('pbx_federation_carriers').select('*').eq('status', 'active');
  return (data || []).filter(c => (c.routes || []).some(r => dest.startsWith(r)));
}

// ── RBAC ─────────────────────────────────────────────────────────────────────

const ROLE_PERMISSIONS = {
  root: [
    'create_reseller','delete_reseller','set_pricing','view_analytics',
    'manage_federation','manage_marketplace','view_all_wallets',
    'transfer_wallet','lock_wallet','issue_credit','manage_numbers',
    'set_rbac','view_revenue_splits','manage_tenants',
  ],
  master_reseller: [
    'create_reseller','set_pricing','view_analytics',
    'manage_marketplace','view_own_wallet','transfer_wallet',
    'view_revenue_splits','manage_tenants',
  ],
  reseller: [
    'view_analytics','view_own_wallet','manage_tenants','view_revenue_splits',
  ],
  tenant: [
    'view_own_wallet','manage_extensions','manage_flows',
  ],
};

function hasPermission(role, permission) {
  return (ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.tenant).includes(permission);
}

function getRoleFromUser(user) {
  if (!user) return 'tenant';
  const r = user.role || '';
  const p = user.plan || '';
  if (r === 'admin' || r === 'superadmin' || p === 'admin') return 'root';
  if (p === 'enterprise') return 'master_reseller';
  if (p === 'pro') return 'reseller';
  return 'tenant';
}

module.exports = {
  ROOT_OWNER_ID,
  getOrCreateWallet, creditWallet, debitWallet,
  lockBalance, releaseBalance, transferWallet,
  getResellerChain, distributeRevenue,
  routeCall, getAvailableRoutes,
  hasPermission, getRoleFromUser, ROLE_PERMISSIONS,
};
