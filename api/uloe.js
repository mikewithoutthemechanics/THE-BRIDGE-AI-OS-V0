// =============================================================================
// BRIDGE AI OS — ULOE REST API  v1
//
// Public (no auth):
//   GET  /api/uloe/health           — engine health
//
// Authenticated (bridge_token cookie or Authorization Bearer):
//
//   Identity:
//   GET  /api/uloe/user/:id         — full user capsule (profile + sub + wallet + modules)
//   POST /api/uloe/user             — create user + run onboarding
//   PATCH /api/uloe/user/:id        — update profile fields
//   POST /api/uloe/user/:id/wallet  — link Ethereum wallet address
//   POST /api/uloe/user/:id/verify  — mark email verified
//   POST /api/uloe/user/:id/type    — set user_type (personal | business)
//
//   Subscription:
//   GET  /api/uloe/user/:id/subscription      — get current subscription
//   POST /api/uloe/user/:id/subscription      — create subscription
//   PATCH /api/uloe/user/:id/subscription     — upgrade / downgrade plan
//   DELETE /api/uloe/user/:id/subscription    — cancel subscription
//   POST /api/uloe/user/:id/subscription/pause
//   POST /api/uloe/user/:id/subscription/resume
//
//   Billing:
//   GET  /api/uloe/user/:id/billing           — transaction history
//   GET  /api/uloe/user/:id/invoices          — invoice list
//   POST /api/uloe/user/:id/billing/charge    — record a charge
//   POST /api/uloe/user/:id/billing/credit    — apply credit
//   POST /api/uloe/user/:id/invoices          — generate invoice
//   POST /api/uloe/user/:id/invoices/:inv/pay — mark invoice paid
//
//   Usage:
//   GET  /api/uloe/user/:id/usage             — quota summary
//   POST /api/uloe/user/:id/usage             — record usage event
//   POST /api/uloe/user/:id/usage/reset       — reset quota (admin only)
//
//   Wallet:
//   GET  /api/uloe/user/:id/wallet            — all ledger balances
//   POST /api/uloe/user/:id/wallet/credit     — credit ledger
//   POST /api/uloe/user/:id/wallet/debit      — debit ledger
//   GET  /api/uloe/user/:id/wallet/transactions
//
//   API Keys:
//   GET  /api/uloe/user/:id/api-keys          — list keys
//   POST /api/uloe/user/:id/api-keys          — create key
//   DELETE /api/uloe/user/:id/api-keys/:key   — revoke key
//   POST /api/uloe/user/:id/api-keys/:key/rotate
//
//   Modules:
//   GET  /api/uloe/user/:id/modules           — all module states
//   POST /api/uloe/user/:id/modules/:mod      — activate module
//   DELETE /api/uloe/user/:id/modules/:mod    — deactivate module
//   GET  /api/uloe/user/:id/modules/:mod/access — check access
//
//   History:
//   GET  /api/uloe/user/:id/history           — lifecycle event log
//   GET  /api/uloe/history/verify             — verify chain integrity (admin)
//
//   Automation:
//   POST /api/uloe/automation/:flow           — run named automation flow
//
//   Validation:
//   POST /api/uloe/validate/api-key           — validate raw API key
// =============================================================================
'use strict';

let uloe = null;
try { uloe = require('../engine/user-lifecycle'); } catch (_) {}

function engineReady(res) {
  if (!uloe) {
    res.status(503).json({ ok: false, error: 'ULOE not loaded' });
    return false;
  }
  return true;
}

function hasAuth(req) {
  return !!(req.cookies?.bridge_token || req.headers.authorization);
}

function isAdmin(req) {
  // Simple admin check — extend with role-based auth as needed
  return req.headers['x-bridge-admin'] === (process.env.BRIDGE_ADMIN_SECRET || 'bridge-admin');
}

function pathParts(url) {
  return (url || '').split('?')[0].split('/').filter(Boolean);
}

// ── Main handler ───────────────────────────────────────────────────────────────
async function handleUloe(req, res) {
  const url    = (req.path || req.url || '').split('?')[0];
  const method = req.method;
  const parts  = pathParts(url);  // ['api', 'uloe', ...]
  const seg    = parts.slice(2);  // strip 'api' + 'uloe'

  // ── Health (public) ──────────────────────────────────────────────────────
  if (url === '/api/uloe/health' && method === 'GET') {
    return res.json({ ok: true, ...(uloe?.health() || { engine: 'ULOE', status: 'not loaded' }) });
  }

  // ── Validate API key (public — used by gateway middleware) ────────────────
  if (url === '/api/uloe/validate/api-key' && method === 'POST') {
    if (!engineReady(res)) return;
    const { api_key } = req.body || {};
    if (!api_key) return res.status(400).json({ ok: false, error: 'api_key required' });
    const result = await uloe.validateApiKey(api_key);
    return res.json({ ok: result.valid, ...result });
  }

  // All other endpoints require auth
  if (!hasAuth(req)) return res.status(401).json({ ok: false, error: 'Auth required' });
  if (!engineReady(res)) return;

  const body   = req.body || {};
  const userId = seg[1]; // /user/:id

  // ── User creation (no :id needed) ─────────────────────────────────────────
  if (url === '/api/uloe/user' && method === 'POST') {
    const result = await uloe.bootstrap(body);
    return res.status(result.status === 'success' ? 201 : 400).json(result);
  }

  // ── Automation flows ──────────────────────────────────────────────────────
  if (seg[0] === 'automation' && seg[1] && method === 'POST') {
    if (!isAdmin(req)) return res.status(403).json({ ok: false, error: 'Admin required' });
    const flow   = seg[1];
    const target = body.user_id;
    if (!target) return res.status(400).json({ ok: false, error: 'user_id required' });
    const result = await uloe.automation.run(flow, target, body);
    return res.json(result);
  }

  // ── History chain verification (admin only) ───────────────────────────────
  if (url === '/api/uloe/history/verify' && method === 'GET') {
    if (!isAdmin(req)) return res.status(403).json({ ok: false, error: 'Admin required' });
    return res.json(uloe.history.verifyChain());
  }

  // All remaining routes need a user_id in path
  if (!userId) return null;

  // ── Capsule (full user state) ─────────────────────────────────────────────
  if (seg.length === 2 && seg[0] === 'user' && method === 'GET') {
    return res.json(await uloe.getCapsule(userId));
  }

  // ── Profile update ────────────────────────────────────────────────────────
  if (seg.length === 2 && seg[0] === 'user' && method === 'PATCH') {
    return res.json(await uloe.identity.updateProfile(userId, body));
  }

  // ── Wallet link ───────────────────────────────────────────────────────────
  if (seg[2] === 'wallet' && seg.length === 3 && method === 'POST' && body.wallet_address) {
    return res.json(await uloe.identity.linkWallet(userId, body.wallet_address));
  }

  // ── Email verify ──────────────────────────────────────────────────────────
  if (seg[2] === 'verify' && method === 'POST') {
    return res.json(await uloe.identity.verifyEmail(userId));
  }

  // ── User type ─────────────────────────────────────────────────────────────
  if (seg[2] === 'type' && method === 'POST') {
    return res.json(await uloe.identity.setUserType(userId, body.user_type));
  }

  // ── Subscription ─────────────────────────────────────────────────────────
  if (seg[2] === 'subscription') {
    const sub = uloe.subscription;
    if (seg.length === 3) {
      if (method === 'GET')    return res.json(await sub.getSubscription(userId) || { status: 'none' });
      if (method === 'POST')   return res.json(await sub.createSubscription(userId, body));
      if (method === 'PATCH')  return res.json(await uloe.upgradePlan(userId, body.plan, body));
      if (method === 'DELETE') return res.json(await uloe.cancelPlan(userId, body));
    }
    if (seg[3] === 'pause'  && method === 'POST') return res.json(await sub.pauseSubscription(userId));
    if (seg[3] === 'resume' && method === 'POST') return res.json(await sub.resumeSubscription(userId));
  }

  // ── Billing ───────────────────────────────────────────────────────────────
  if (seg[2] === 'billing') {
    const b = uloe.billing;
    if (method === 'GET')  return res.json(await b.getBillingHistory(userId));
    if (method === 'POST') {
      if (seg[3] === 'charge') return res.json(await b.charge(userId, body));
      if (seg[3] === 'credit') return res.json(await b.applyCredit(userId, body));
    }
  }

  // ── Invoices ──────────────────────────────────────────────────────────────
  if (seg[2] === 'invoices') {
    const b = uloe.billing;
    if (seg.length === 3 && method === 'GET')  return res.json(await b.getInvoices(userId));
    if (seg.length === 3 && method === 'POST') return res.json(await b.generateInvoice(userId, body));
    if (seg[4] === 'pay' && method === 'POST') return res.json(await b.markInvoicePaid(userId, seg[3]));
  }

  // ── Usage ─────────────────────────────────────────────────────────────────
  if (seg[2] === 'usage') {
    const u = uloe.usage;
    if (seg.length === 3 && method === 'GET')  return res.json(await u.getSummary(userId));
    if (seg.length === 3 && method === 'POST') return res.json(await uloe.recordApiCall(userId, body));
    if (seg[3] === 'reset' && method === 'POST') {
      if (!isAdmin(req)) return res.status(403).json({ ok: false, error: 'Admin required' });
      return res.json(await u.resetQuota(userId, body));
    }
  }

  // ── Wallet ────────────────────────────────────────────────────────────────
  if (seg[2] === 'wallet') {
    const w = uloe.wallet;
    if (seg.length === 3 && method === 'GET')  return res.json(await w.getBalances(userId));
    if (seg[3] === 'credit' && method === 'POST') return res.json(await w.credit(userId, body));
    if (seg[3] === 'debit'  && method === 'POST') return res.json(await w.debit(userId, body));
    if (seg[3] === 'transactions' && method === 'GET') return res.json(await w.getTransactions(userId, req.query));
  }

  // ── API Keys ──────────────────────────────────────────────────────────────
  if (seg[2] === 'api-keys') {
    const k = uloe.apiKeys;
    if (seg.length === 3 && method === 'GET')  return res.json(await k.listKeys(userId));
    if (seg.length === 3 && method === 'POST') return res.json(await k.createKey(userId, body));
    if (seg[3] && method === 'DELETE')         return res.json(await k.revokeKey(userId, seg[3]));
    if (seg[4] === 'rotate' && method === 'POST') return res.json(await k.rotateKey(userId, seg[3]));
  }

  // ── Modules ───────────────────────────────────────────────────────────────
  if (seg[2] === 'modules') {
    const m = uloe.modules;
    if (seg.length === 3 && method === 'GET')  return res.json(await m.getUserModules(userId));
    if (seg[3] && method === 'POST')           return res.json(await m.activate(userId, seg[3], body));
    if (seg[3] && method === 'DELETE')         return res.json(await m.deactivate(userId, seg[3]));
    if (seg[4] === 'access' && method === 'GET') return res.json(await uloe.checkAccess(userId, seg[3]));
  }

  // ── History ───────────────────────────────────────────────────────────────
  if (seg[2] === 'history' && method === 'GET') {
    const events = await uloe.history.getHistory(userId, {
      category: req.query.category,
      limit:    parseInt(req.query.limit) || 50,
      offset:   parseInt(req.query.offset) || 0,
    });
    return res.json({ ok: true, count: events.length, events });
  }

  return null; // not handled
}

module.exports = { handleUloe };
