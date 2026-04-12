'use strict';
/**
 * BRIDGE AI OS — eSIM + PBX API Routes
 * Mounted at: /api/esim/*  and  /api/pbx/*
 *
 * Endpoints:
 *  GET    /api/esim/plans                 — list available plans
 *  GET    /api/esim/stats                 — platform stats
 *  GET    /api/esim/list                  — list all eSIMs (admin)
 *  POST   /api/esim/provision             — activate a new eSIM
 *  GET    /api/esim/:id                   — get eSIM details
 *  PATCH  /api/esim/:id/activate          — activate pending eSIM
 *  POST   /api/esim/:id/topup             — top-up data/voice/wallet
 *  POST   /api/esim/nurture               — AI score + nurture a lead
 *  GET    /api/esim/nurture/queue         — get nurture queue
 *  GET    /api/pbx/numbers                — list available numbers
 *  POST   /api/pbx/provision              — provision PBX extension
 *  GET    /api/pbx/extensions             — list extensions
 *  POST   /api/pbx/cdr                    — log a call
 *  GET    /api/pbx/cdr                    — call history
 *  POST   /api/esim/register              — self-serve signup (leads.html CTA)
 */

const svc = require('../../lib/esim-pbx-service');

// ─── Body parser helper (matches rest of codebase) ────────────────────────────
async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body; // Express already parsed
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) reject(new Error('Body too large')); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function json(res, data, status = 200) {
  res.status(status).json(data);
  return true;
}

/**
 * Main route handler — called by server.js app.all('/api/esim/*')
 * Returns true if handled, next() otherwise.
 */
async function handleESim(req, res) {
  const method = req.method.toUpperCase();
  const url    = new URL(req.url, 'http://localhost');
  const p      = url.pathname;

  try {

    // ── GET /api/esim/plans ───────────────────────────────────────────────────
    if (p === '/api/esim/plans' && method === 'GET') {
      const plans = await svc.getPlans();
      return json(res, { plans });
    }

    // ── GET /api/esim/stats ───────────────────────────────────────────────────
    if (p === '/api/esim/stats' && method === 'GET') {
      const stats = await svc.getStats();
      return json(res, stats);
    }

    // ── GET /api/esim/list ────────────────────────────────────────────────────
    if (p === '/api/esim/list' && method === 'GET') {
      const status = url.searchParams.get('status') || '';
      const limit  = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const result = await svc.listESims({ status, limit, offset });
      return json(res, result);
    }

    // ── POST /api/esim/register ───────────────────────────────────────────────
    // Self-serve signup from the landing page — creates lead + provisions eSIM
    if (p === '/api/esim/register' && method === 'POST') {
      const body = await parseBody(req);
      const { name, email, phone, company, plan_name, country_code, referral_code } = body;
      if (!name || !email) return json(res, { error: 'name and email required' }, 400);

      // 1. Provision eSIM
      const provisionResult = await svc.provisionESim({ name, email, phone, plan_name, country_code });
      if (!provisionResult.ok) return json(res, { error: provisionResult.error }, 500);

      // 2. Provision PBX extension
      const pbxResult = await svc.provisionPBXExtension({
        esim_id: provisionResult.esim.id,
        display_name: name,
        country: country_code || 'ZA',
      });

      // 3. Create CRM lead via Supabase directly
      const { supabase } = require('../../lib/supabase');
      let leadId = null;
      if (supabase) {
        const { data: lead } = await supabase.from('contacts').insert({
          name, email, phone: phone || null,
          company_name: company || null,
          status: 'lead', stage: 'new',
          source: 'esim_signup',
          score: 60,
          tags: ['esim', 'pbx', plan_name || 'global_starter'],
          notes: `Signed up for eSIM + PBX. Plan: ${plan_name || 'Global Starter'}. iccid: ${provisionResult.esim.iccid}`,
          meta: { esim_id: provisionResult.esim.id, referral_code },
        }).select().single().catch(() => ({ data: null }));
        leadId = lead?.id;

        // Link contact to eSIM
        if (leadId) {
          await supabase.from('esim_accounts').update({ contact_id: leadId }).eq('id', provisionResult.esim.id);
        }
      }

      // 4. Fire AI nurture (async — don't await to keep response fast)
      if (leadId) {
        svc.scoreAndNurtureLead({
          lead_id: leadId, name, email, company, phone,
          status: 'new', score: 60,
          tags: ['esim', 'pbx', plan_name || 'global_starter'],
          source: 'esim_signup',
        }).catch(() => {});
      }

      return json(res, {
        ok: true,
        message: 'eSIM + PBX provisioned successfully',
        esim: {
          id:           provisionResult.esim.id,
          iccid:        provisionResult.esim.iccid,
          plan:         provisionResult.plan?.name,
          status:       provisionResult.esim.status,
          activation_qr: provisionResult.qr_url,
          lpa:          provisionResult.lpa,
        },
        pbx: pbxResult.ok ? {
          extension:   pbxResult.extension?.extension,
          did_number:  pbxResult.extension?.did_number,
          sip_domain:  pbxResult.extension?.sip_domain,
          sip_username: pbxResult.sip_credentials?.username,
        } : null,
        lead_id: leadId,
        next_steps: [
          'Scan the QR code in your eSIM settings',
          `Connect SIP client to ${pbxResult.extension?.sip_domain || 'pbx.bridge-ai-os.com'}`,
          'Add data to your wallet from the dashboard',
        ],
      }, 201);
    }

    // ── POST /api/esim/provision ──────────────────────────────────────────────
    if (p === '/api/esim/provision' && method === 'POST') {
      const body = await parseBody(req);
      const result = await svc.provisionESim(body);
      if (!result.ok) return json(res, { error: result.error }, 500);
      return json(res, result, 201);
    }

    // ── GET /api/esim/nurture/queue ───────────────────────────────────────────
    if (p === '/api/esim/nurture/queue' && method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const queue = await svc.getNurtureQueue({ limit });
      return json(res, { queue, count: queue.length });
    }

    // ── POST /api/esim/nurture ────────────────────────────────────────────────
    if (p === '/api/esim/nurture' && method === 'POST') {
      const body = await parseBody(req);
      const { lead_id, name, email, company, phone, status, score, tags, notes, source } = body;
      if (!lead_id && !email) return json(res, { error: 'lead_id or email required' }, 400);
      const result = await svc.scoreAndNurtureLead({ lead_id, name, email, company, phone, status, score, tags, notes, source });
      return json(res, result);
    }

    // ── GET /api/esim/:id ─────────────────────────────────────────────────────
    const idMatch = p.match(/^\/api\/esim\/([a-f0-9-]{36})$/);
    if (idMatch && method === 'GET') {
      const esim = await svc.getESimById(idMatch[1]);
      if (!esim) return json(res, { error: 'eSIM not found' }, 404);
      return json(res, { esim });
    }

    // ── PATCH /api/esim/:id/activate ─────────────────────────────────────────
    const activateMatch = p.match(/^\/api\/esim\/([a-f0-9-]{36})\/activate$/);
    if (activateMatch && method === 'PATCH') {
      const result = await svc.activateESim(activateMatch[1]);
      if (!result.ok) return json(res, { error: result.error }, 500);
      return json(res, result);
    }

    // ── POST /api/esim/:id/topup ──────────────────────────────────────────────
    const topupMatch = p.match(/^\/api\/esim\/([a-f0-9-]{36})\/topup$/);
    if (topupMatch && method === 'POST') {
      const body = await parseBody(req);
      const result = await svc.topupESim({ esim_id: topupMatch[1], ...body });
      if (!result.ok) return json(res, { error: result.error }, 500);
      return json(res, result);
    }

    // ═══ PBX ROUTES ═══

    // ── GET /api/pbx/numbers ──────────────────────────────────────────────────
    if (p === '/api/pbx/numbers' && method === 'GET') {
      const status  = url.searchParams.get('status') || '';
      const country = url.searchParams.get('country') || '';
      const result  = await svc.listNumbers({ status, country });
      return json(res, result);
    }

    // ── POST /api/pbx/provision ───────────────────────────────────────────────
    if (p === '/api/pbx/provision' && method === 'POST') {
      const body = await parseBody(req);
      const { esim_id, display_name, did_number, country } = body;
      if (!esim_id) return json(res, { error: 'esim_id required' }, 400);
      const result = await svc.provisionPBXExtension({ esim_id, display_name, did_number, country });
      if (!result.ok) return json(res, { error: result.error }, 500);
      return json(res, result, 201);
    }

    // ── GET /api/pbx/extensions ───────────────────────────────────────────────
    if (p === '/api/pbx/extensions' && method === 'GET') {
      const esim_id = url.searchParams.get('esim_id') || '';
      const exts = await svc.listExtensions(esim_id || null);
      return json(res, { extensions: exts, count: exts.length });
    }

    // ── POST /api/pbx/cdr ─────────────────────────────────────────────────────
    if (p === '/api/pbx/cdr' && method === 'POST') {
      const body = await parseBody(req);
      const result = await svc.logCall(body);
      return json(res, result, result.ok ? 201 : 500);
    }

    // ── GET /api/pbx/cdr ──────────────────────────────────────────────────────
    if (p === '/api/pbx/cdr' && method === 'GET') {
      const extension_id = url.searchParams.get('extension_id') || '';
      const limit  = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const result = await svc.getCallHistory({ extension_id, limit, offset });
      return json(res, result);
    }

    return null; // Not handled — pass to next middleware
  } catch (err) {
    console.error('[eSIM API]', err);
    return json(res, { error: 'Internal server error', detail: err.message }, 500);
  }
}

module.exports = { handleESim };
