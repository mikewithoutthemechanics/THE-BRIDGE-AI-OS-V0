'use strict';
/**
 * PBX Reseller API
 *
 * POST /api/pbx/reseller/create           — create reseller (any level)
 * GET  /api/pbx/reseller/tree             — full hierarchy tree
 * POST /api/pbx/reseller/auto-onboard     — marketplace/partner auto-signup
 * GET  /api/pbx/reseller/:id              — get single reseller
 * POST /api/pbx/reseller/:id/credit       — credit reseller wallet
 * POST /api/pbx/reseller/:id/markup       — update pricing/markup rules
 * GET  /api/pbx/reseller/:id/analytics    — revenue + usage analytics
 */

const crypto = require('crypto');
const { supabase, isConfigured } = require('../../lib/supabase');
const { getOrCreateWallet, creditWallet, getRoleFromUser } = require('../../lib/telecom-engine');
const { extractUser } = require('../../middleware/access-control');

function json(res, data, status = 200) { res.status(status).json(data); return true; }

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) reject(new Error('Body too large')); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

async function handleReseller(req, res) {
  const method = req.method.toUpperCase();
  const url    = new URL(req.url, 'http://localhost');
  const p      = url.pathname;

  const user = await extractUser(req);
  if (!user) return json(res, { error: 'Authentication required' }, 401);
  if (!isConfigured) return json(res, { error: 'Database not configured' }, 500);

  const role = getRoleFromUser(user);

  try {

    // POST /api/pbx/reseller/create ──────────────────────────────────────────
    if (p === '/api/pbx/reseller/create' && method === 'POST') {
      if (!['root','master_reseller'].includes(role))
        return json(res, { error: 'Insufficient permissions' }, 403);

      const body = await parseBody(req);
      const { name, email, phone, parent_id, level = 2, pricing, markup_rules, custom_domain, white_label } = body;
      if (!name) return json(res, { error: 'name required' }, 400);
      if (![0,1,2].includes(parseInt(level))) return json(res, { error: 'level must be 0, 1, or 2' }, 400);

      const resellerId = crypto.randomUUID();
      const wallet     = await getOrCreateWallet(resellerId, 'reseller');
      const now        = new Date().toISOString();

      const { data, error } = await supabase.from('pbx_resellers').insert({
        id: resellerId, parent_id: parent_id || null,
        level: parseInt(level), name, email: email || null, phone: phone || null,
        status: 'active', wallet_id: wallet.id,
        pricing:      pricing      || { call_per_min: 0.05, did_monthly: 1.00, data_per_mb: 0.01, sms_per_unit: 0.02 },
        markup_rules: markup_rules || { min_margin: 10, max_discount: 30, revenue_share_pct: 20 },
        white_label:  white_label  || {},
        custom_domain: custom_domain || null,
        created_by: user.id,
        created_at: now, updated_at: now,
      }).select().single();

      if (error) return json(res, { error: error.message }, 500);
      return json(res, { ok: true, reseller: data, wallet }, 201);
    }

    // GET /api/pbx/reseller/tree ──────────────────────────────────────────────
    if (p === '/api/pbx/reseller/tree' && method === 'GET') {
      const { data } = await supabase
        .from('pbx_resellers')
        .select('id,parent_id,level,name,email,status,pricing,markup_rules,created_at,wallet_id')
        .order('level').order('created_at');

      function buildTree(parentId) {
        return (data || [])
          .filter(r => (r.parent_id || null) === parentId)
          .map(r => ({ ...r, children: buildTree(r.id) }));
      }

      return json(res, { ok: true, tree: buildTree(null), total: (data || []).length });
    }

    // POST /api/pbx/reseller/auto-onboard ────────────────────────────────────
    if (p === '/api/pbx/reseller/auto-onboard' && method === 'POST') {
      const body = await parseBody(req);
      const { name, email, source = 'marketplace', parent_id } = body;
      if (!name || !email) return json(res, { error: 'name and email required' }, 400);

      const resellerId = crypto.randomUUID();
      const wallet     = await getOrCreateWallet(resellerId, 'reseller');
      const now        = new Date().toISOString();

      const { data, error } = await supabase.from('pbx_resellers').insert({
        id: resellerId, parent_id: parent_id || null, level: 2,
        name, email, status: 'active', wallet_id: wallet.id,
        pricing:      { call_per_min: 0.06, did_monthly: 1.50, data_per_mb: 0.015, sms_per_unit: 0.03 },
        markup_rules: { min_margin: 15, max_discount: 20, revenue_share_pct: 15 },
        meta: { source, onboarded_at: now },
        created_by: user.id, created_at: now, updated_at: now,
      }).select().single();

      if (error) return json(res, { error: error.message }, 500);

      // Seed CRM contact (non-blocking)
      supabase.from('contacts').insert({
        name, email, status: 'customer', stage: 'closed_won',
        source: 'pbx_reseller_auto', tags: ['reseller', source], score: 85,
        meta: { reseller_id: resellerId },
      }).catch(() => {});

      return json(res, { ok: true, reseller: data, wallet, dashboard_url: '/carrier' }, 201);
    }

    // GET /api/pbx/reseller/:id ───────────────────────────────────────────────
    const idMatch = p.match(/^\/api\/pbx\/reseller\/([a-f0-9-]{36})$/);
    if (idMatch && method === 'GET') {
      const { data } = await supabase.from('pbx_resellers').select('*').eq('id', idMatch[1]).single();
      if (!data) return json(res, { error: 'Not found' }, 404);
      const { data: wallet } = await supabase.from('pbx_wallets').select('*').eq('owner_id', idMatch[1]).eq('owner_type', 'reseller').single();
      return json(res, { ok: true, reseller: data, wallet });
    }

    // POST /api/pbx/reseller/:id/credit ──────────────────────────────────────
    const creditMatch = p.match(/^\/api\/pbx\/reseller\/([a-f0-9-]{36})\/credit$/);
    if (creditMatch && method === 'POST') {
      if (!['root'].includes(role)) return json(res, { error: 'root only' }, 403);
      const body = await parseBody(req);
      const { amount, reference } = body;
      if (!amount) return json(res, { error: 'amount required' }, 400);

      const { data: reseller } = await supabase.from('pbx_resellers').select('wallet_id').eq('id', creditMatch[1]).single();
      if (!reseller?.wallet_id) return json(res, { error: 'Reseller not found' }, 404);

      const newBalance = await creditWallet(reseller.wallet_id, parseFloat(amount), reference || 'manual_' + Date.now());
      return json(res, { ok: true, wallet_id: reseller.wallet_id, new_balance: newBalance });
    }

    // POST /api/pbx/reseller/:id/markup ──────────────────────────────────────
    const markupMatch = p.match(/^\/api\/pbx\/reseller\/([a-f0-9-]{36})\/markup$/);
    if (markupMatch && method === 'POST') {
      const body = await parseBody(req);
      const updates = { updated_at: new Date().toISOString() };
      if (body.pricing)      updates.pricing      = body.pricing;
      if (body.markup_rules) updates.markup_rules = body.markup_rules;
      if (body.white_label)  updates.white_label  = body.white_label;

      const { data, error } = await supabase.from('pbx_resellers').update(updates).eq('id', markupMatch[1]).select().single();
      if (error) return json(res, { error: error.message }, 500);
      return json(res, { ok: true, reseller: data });
    }

    // GET /api/pbx/reseller/:id/analytics ────────────────────────────────────
    const analyticsMatch = p.match(/^\/api\/pbx\/reseller\/([a-f0-9-]{36})\/analytics$/);
    if (analyticsMatch && method === 'GET') {
      const id = analyticsMatch[1];
      const [resellerRes, walletRes, splitsRes, subRes, txRes] = await Promise.all([
        supabase.from('pbx_resellers').select('*').eq('id', id).single(),
        supabase.from('pbx_wallets').select('*').eq('owner_id', id).eq('owner_type', 'reseller').single(),
        supabase.from('pbx_revenue_splits').select('*').eq('reseller_id', id).order('created_at', { ascending: false }).limit(100),
        supabase.from('pbx_resellers').select('id,name,level,status').eq('parent_id', id),
        supabase.from('pbx_wallet_transactions').select('amount,type,created_at').eq('wallet_id',
          (await supabase.from('pbx_wallets').select('id').eq('owner_id', id).eq('owner_type', 'reseller').single()).data?.id || '00000000-0000-0000-0000-000000000000'
        ).order('created_at', { ascending: false }).limit(20),
      ]);

      const splits   = splitsRes.data || [];
      const subTotal = splits.reduce((s, r) => {
        const cut = (r.splits || []).find(sp => sp.reseller_id === id);
        return s + (parseFloat(cut?.amount) || 0);
      }, 0);

      return json(res, {
        ok: true,
        reseller: resellerRes.data,
        wallet:   walletRes.data,
        analytics: {
          total_revenue_received: Math.round(subTotal * 100) / 100,
          split_events:           splits.length,
          sub_resellers:          (subRes.data || []).length,
          active_sub_resellers:   (subRes.data || []).filter(r => r.status === 'active').length,
        },
        recent_splits:      splits.slice(0, 10),
        sub_resellers:      subRes.data || [],
        recent_transactions: txRes.data || [],
      });
    }

    return null; // Not handled
  } catch (err) {
    console.error('[Reseller API]', err);
    return json(res, { error: 'Internal error', detail: err.message }, 500);
  }
}

module.exports = { handleReseller };
