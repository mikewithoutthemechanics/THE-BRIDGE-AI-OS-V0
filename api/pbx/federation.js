'use strict';
/**
 * PBX Federation API
 *
 * POST /api/pbx/federation/connect       — register new federation carrier
 * GET  /api/pbx/federation/routes        — all active carriers + route table
 * POST /api/pbx/federation/route         — test/select best route for destination
 * GET  /api/pbx/federation/:id           — single carrier detail
 * PATCH /api/pbx/federation/:id          — update carrier (rates/routes/status)
 * DELETE /api/pbx/federation/:id         — deactivate carrier
 */

const crypto = require('crypto');
const { supabase, isConfigured } = require('../../lib/supabase');
const { routeCall, getAvailableRoutes, getRoleFromUser, hasPermission } = require('../../lib/telecom-engine');
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

async function handleFederation(req, res) {
  const method = req.method.toUpperCase();
  const url    = new URL(req.url, 'http://localhost');
  const p      = url.pathname;

  const user = await extractUser(req);
  if (!user) return json(res, { error: 'Authentication required' }, 401);
  if (!isConfigured) return json(res, { error: 'Database not configured' }, 500);

  const role = getRoleFromUser(user);

  try {

    // POST /api/pbx/federation/connect ───────────────────────────────────────
    if (p === '/api/pbx/federation/connect' && method === 'POST') {
      if (!hasPermission(role, 'manage_federation'))
        return json(res, { error: 'Insufficient permissions' }, 403);

      const body = await parseBody(req);
      const {
        carrier_id, name, endpoint, routes = [], rates = {},
        auth = { type: 'ip' }, priority = 5, latency_ms = 50,
      } = body;

      if (!carrier_id || !name || !endpoint)
        return json(res, { error: 'carrier_id, name, and endpoint required' }, 400);

      // Validate routes array (prefix strings like "+27", "+1")
      const validRoutes = (Array.isArray(routes) ? routes : [])
        .filter(r => typeof r === 'string' && r.startsWith('+'));

      const now = new Date().toISOString();
      const { data, error } = await supabase.from('pbx_federation_carriers').insert({
        carrier_id,
        name,
        endpoint,
        routes: validRoutes,
        rates: {
          per_min: parseFloat(rates.per_min) || 0.05,
          connect_fee: parseFloat(rates.connect_fee) || 0.01,
          ...rates,
        },
        auth,
        status: 'testing',  // starts in testing — must be activated manually
        priority: parseInt(priority) || 5,
        latency_ms: parseInt(latency_ms) || 50,
        success_rate: 99.00,
        created_at: now,
        updated_at: now,
      }).select().single();

      if (error) {
        if (error.code === '23505') return json(res, { error: 'carrier_id already exists' }, 409);
        return json(res, { error: error.message }, 500);
      }
      return json(res, { ok: true, carrier: data }, 201);
    }

    // GET /api/pbx/federation/routes ─────────────────────────────────────────
    if (p === '/api/pbx/federation/routes' && method === 'GET') {
      const { data: carriers } = await supabase
        .from('pbx_federation_carriers')
        .select('id,carrier_id,name,endpoint,routes,rates,status,priority,latency_ms,success_rate,updated_at')
        .order('priority', { ascending: true });

      // Build consolidated route table: prefix → [carriers sorted by cost]
      const routeTable = {};
      for (const c of (carriers || [])) {
        if (c.status !== 'active') continue;
        for (const prefix of (c.routes || [])) {
          if (!routeTable[prefix]) routeTable[prefix] = [];
          routeTable[prefix].push({
            carrier_id: c.carrier_id,
            name: c.name,
            per_min: c.rates?.per_min,
            latency_ms: c.latency_ms,
            success_rate: c.success_rate,
            priority: c.priority,
          });
        }
      }
      // Sort each prefix entry by cost → latency → success_rate
      for (const prefix of Object.keys(routeTable)) {
        routeTable[prefix].sort((a, b) => {
          const costDiff = (a.per_min || 999) - (b.per_min || 999);
          if (Math.abs(costDiff) > 0.001) return costDiff;
          if (a.latency_ms !== b.latency_ms) return a.latency_ms - b.latency_ms;
          return (b.success_rate || 0) - (a.success_rate || 0);
        });
      }

      return json(res, {
        ok: true,
        carriers: carriers || [],
        route_table: routeTable,
        active_carriers: (carriers || []).filter(c => c.status === 'active').length,
        total_prefixes: Object.keys(routeTable).length,
      });
    }

    // POST /api/pbx/federation/route ─────────────────────────────────────────
    if (p === '/api/pbx/federation/route' && method === 'POST') {
      const body = await parseBody(req);
      const { destination } = body;
      if (!destination) return json(res, { error: 'destination required' }, 400);

      const [bestCarrier, allRoutes] = await Promise.all([
        routeCall(destination),
        getAvailableRoutes(destination),
      ]);

      return json(res, {
        ok: true,
        destination,
        best_carrier: bestCarrier,
        all_routes: allRoutes,
        route_count: allRoutes.length,
      });
    }

    // GET /api/pbx/federation/:id ────────────────────────────────────────────
    const idMatch = p.match(/^\/api\/pbx\/federation\/([a-f0-9-]{36})$/);
    if (idMatch && method === 'GET') {
      const { data } = await supabase
        .from('pbx_federation_carriers')
        .select('*')
        .eq('id', idMatch[1])
        .single();
      if (!data) return json(res, { error: 'Not found' }, 404);
      return json(res, { ok: true, carrier: data });
    }

    // PATCH /api/pbx/federation/:id ──────────────────────────────────────────
    const patchMatch = p.match(/^\/api\/pbx\/federation\/([a-f0-9-]{36})$/);
    if (patchMatch && method === 'PATCH') {
      if (!hasPermission(role, 'manage_federation'))
        return json(res, { error: 'Insufficient permissions' }, 403);

      const body = await parseBody(req);
      const allowed = ['name','endpoint','routes','rates','auth','status','priority','latency_ms','success_rate'];
      const updates = { updated_at: new Date().toISOString() };
      for (const k of allowed) {
        if (body[k] !== undefined) updates[k] = body[k];
      }
      if (updates.status && !['active','inactive','testing'].includes(updates.status))
        return json(res, { error: 'Invalid status' }, 400);

      const { data, error } = await supabase
        .from('pbx_federation_carriers')
        .update(updates)
        .eq('id', patchMatch[1])
        .select()
        .single();
      if (error) return json(res, { error: error.message }, 500);
      return json(res, { ok: true, carrier: data });
    }

    // DELETE /api/pbx/federation/:id ─────────────────────────────────────────
    const deleteMatch = p.match(/^\/api\/pbx\/federation\/([a-f0-9-]{36})$/);
    if (deleteMatch && method === 'DELETE') {
      if (!hasPermission(role, 'manage_federation'))
        return json(res, { error: 'Insufficient permissions' }, 403);

      const { error } = await supabase
        .from('pbx_federation_carriers')
        .update({ status: 'inactive', updated_at: new Date().toISOString() })
        .eq('id', deleteMatch[1]);
      if (error) return json(res, { error: error.message }, 500);
      return json(res, { ok: true });
    }

    return null; // Not handled
  } catch (err) {
    console.error('[Federation API]', err);
    return json(res, { error: 'Internal error', detail: err.message }, 500);
  }
}

module.exports = { handleFederation };
