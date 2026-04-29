'use strict';
/**
 * PBX Number Marketplace API
 *
 * GET  /api/pbx/marketplace/numbers       — list available numbers (filter: country, type)
 * POST /api/pbx/marketplace/buy           — purchase/reserve a number
 * POST /api/pbx/marketplace/list          — list a number for sale
 * GET  /api/pbx/marketplace/my-numbers    — numbers owned by authenticated reseller
 * POST /api/pbx/marketplace/release/:num  — release a number back to marketplace
 */

const { supabase, isConfigured } = require('../../lib/supabase');
const { debitWallet, getOrCreateWallet, getRoleFromUser } = require('../../lib/telecom-engine');
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

async function handlePBXMarketplace(req, res) {
  const method = req.method.toUpperCase();
  const url    = new URL(req.url, 'http://localhost');
  const p      = url.pathname;
  const q      = url.searchParams;

  const user = await extractUser(req);
  if (!user) return json(res, { error: 'Authentication required' }, 401);
  if (!isConfigured) return json(res, { error: 'Database not configured' }, 500);

  const role = getRoleFromUser(user);

  try {

    // GET /api/pbx/marketplace/numbers ───────────────────────────────────────
    if (p === '/api/pbx/marketplace/numbers' && method === 'GET') {
      let query = supabase
        .from('pbx_number_marketplace')
        .select('id,number,country,country_code,type,capabilities,price_monthly,price_setup,status')
        .eq('status', 'available')
        .order('country')
        .order('price_monthly');

      if (q.get('country'))  query = query.eq('country_code', q.get('country').toUpperCase());
      if (q.get('type'))     query = query.eq('type', q.get('type'));

      const limit = Math.min(parseInt(q.get('limit') || '50'), 200);
      query = query.limit(limit);

      const { data, error } = await query;
      if (error) return json(res, { error: error.message }, 500);

      return json(res, { ok: true, numbers: data || [], count: (data || []).length });
    }

    // POST /api/pbx/marketplace/buy ──────────────────────────────────────────
    if (p === '/api/pbx/marketplace/buy' && method === 'POST') {
      const body = await parseBody(req);
      const { number_id, reseller_id } = body;
      if (!number_id) return json(res, { error: 'number_id required' }, 400);

      // Fetch the number
      const { data: num } = await supabase
        .from('pbx_number_marketplace')
        .select('*')
        .eq('id', number_id)
        .single();
      if (!num) return json(res, { error: 'Number not found' }, 404);
      if (num.status !== 'available') return json(res, { error: 'Number not available' }, 409);

      // Determine buyer's wallet
      const ownerId = reseller_id || user.id;
      const ownerType = reseller_id ? 'reseller' : 'tenant';
      const wallet = await getOrCreateWallet(ownerId, ownerType);

      if (!wallet?.id) return json(res, { error: 'Wallet not found' }, 400);

      // Deduct setup fee + first month
      const total = (parseFloat(num.price_setup) || 0) + (parseFloat(num.price_monthly) || 0);
      if (total > 0) {
        try {
          await debitWallet(wallet.id, total, 'number_purchase_' + number_id, {
            number: num.number,
            type: 'number_purchase',
          });
        } catch (e) {
          return json(res, { error: 'Insufficient wallet balance', detail: e.message }, 402);
        }
      }

      // Mark as sold and assign owner
      const now = new Date().toISOString();
      const reservedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: updated, error: upErr } = await supabase
        .from('pbx_number_marketplace')
        .update({
          status: 'sold',
          owner_reseller_id: reseller_id || null,
          reserved_by: user.id,
          reserved_until: reservedUntil,
          meta: { ...(num.meta || {}), purchased_at: now, purchased_by: user.id },
        })
        .eq('id', number_id)
        .eq('status', 'available')  // optimistic lock
        .select()
        .single();

      if (upErr || !updated)
        return json(res, { error: 'Number was taken concurrently — please try another' }, 409);

      return json(res, {
        ok: true,
        number: updated,
        amount_charged: total,
        wallet_id: wallet.id,
        valid_until: reservedUntil,
      });
    }

    // POST /api/pbx/marketplace/list ─────────────────────────────────────────
    if (p === '/api/pbx/marketplace/list' && method === 'POST') {
      if (!['root','master_reseller'].includes(role))
        return json(res, { error: 'Insufficient permissions' }, 403);

      const body = await parseBody(req);
      const { number, country, country_code, type = 'did', capabilities = ['voice','sms'],
              price_monthly, price_setup = 0, reseller_id } = body;

      if (!number || !country || !price_monthly)
        return json(res, { error: 'number, country, price_monthly required' }, 400);

      const { data, error } = await supabase.from('pbx_number_marketplace').insert({
        number,
        country,
        country_code: country_code || null,
        type,
        capabilities,
        owner_reseller_id: reseller_id || null,
        listed_by: user.id,
        price_monthly: parseFloat(price_monthly),
        price_setup: parseFloat(price_setup) || 0,
        status: 'available',
        meta: { listed_at: new Date().toISOString() },
      }).select().single();

      if (error) {
        if (error.code === '23505') return json(res, { error: 'Number already in marketplace' }, 409);
        return json(res, { error: error.message }, 500);
      }
      return json(res, { ok: true, number: data }, 201);
    }

    // GET /api/pbx/marketplace/my-numbers ────────────────────────────────────
    if (p === '/api/pbx/marketplace/my-numbers' && method === 'GET') {
      const resellerId = q.get('reseller_id');
      let query = supabase
        .from('pbx_number_marketplace')
        .select('*')
        .order('created_at', { ascending: false });

      if (resellerId) {
        query = query.eq('owner_reseller_id', resellerId);
      } else {
        // tenant view: numbers reserved by this user
        query = query.eq('reserved_by', user.id).neq('status', 'available');
      }

      const { data, error } = await query;
      if (error) return json(res, { error: error.message }, 500);
      return json(res, { ok: true, numbers: data || [], count: (data || []).length });
    }

    // POST /api/pbx/marketplace/release/:encodedNum ──────────────────────────
    const releaseMatch = p.match(/^\/api\/pbx\/marketplace\/release\/(.+)$/);
    if (releaseMatch && method === 'POST') {
      const number = decodeURIComponent(releaseMatch[1]);

      const { data: num } = await supabase
        .from('pbx_number_marketplace')
        .select('id,status,reserved_by,owner_reseller_id')
        .eq('number', number)
        .single();

      if (!num) return json(res, { error: 'Number not found' }, 404);

      // Only the buyer, the owning reseller's root user, or an admin can release
      const canRelease = role === 'root'
        || num.reserved_by === user.id
        || (num.owner_reseller_id && role === 'master_reseller');

      if (!canRelease) return json(res, { error: 'Insufficient permissions' }, 403);

      const { error } = await supabase
        .from('pbx_number_marketplace')
        .update({
          status: 'available',
          owner_reseller_id: null,
          reserved_by: null,
          reserved_until: null,
          meta: { released_at: new Date().toISOString(), released_by: user.id },
        })
        .eq('id', num.id);

      if (error) return json(res, { error: error.message }, 500);
      return json(res, { ok: true, number, status: 'available' });
    }

    return null; // Not handled
  } catch (err) {
    console.error('[PBX Marketplace API]', err);
    return json(res, { error: 'Internal error', detail: err.message }, 500);
  }
}

module.exports = { handlePBXMarketplace };
