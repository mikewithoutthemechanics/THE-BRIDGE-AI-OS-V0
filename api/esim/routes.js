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
 *
 *  Carrier dashboard (auth required):
 *  GET    /api/pbx/dashboard              — aggregated carrier overview
 *  GET    /api/pbx/flows                  — list call flows (IVR/queues)
 *  POST   /api/pbx/flows                  — create/update call flow
 *  DELETE /api/pbx/flows/:id              — delete call flow
 *  GET    /api/pbx/wallet                 — wallet balance + recent topups
 *  POST   /api/pbx/wallet/topup           — add funds (generates invoice)
 *  POST   /api/pbx/carrier/activate       — marketplace one-click: project + PBX tenant
 */

const crypto = require('crypto');
const svc = require('../../lib/esim-pbx-service');
const { extractUser } = require('../../middleware/access-control');
const { supabase, isConfigured } = require('../../lib/supabase');
const { handleReseller }      = require('../pbx/reseller');
const { handleFederation }    = require('../pbx/federation');
const { handlePBXMarketplace } = require('../pbx/marketplace');

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
      const [stats, llmUsage, llmProviders] = await Promise.all([
        svc.getStats(),
        Promise.resolve(svc.getLLMUsage()),
        Promise.resolve(svc.getLLMProviders()),
      ]);
      return json(res, { ...stats, llm: { usage: llmUsage, providers: llmProviders } });
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

    // ═══ CARRIER DASHBOARD (auth-gated) ═══════════════════════════════════════

    // ── GET /api/pbx/dashboard ─────────────────────────────────────────────────
    if (p === '/api/pbx/dashboard' && method === 'GET') {
      const user = await extractUser(req);
      if (!user) return json(res, { error: 'Authentication required' }, 401);
      if (!isConfigured) return json(res, { extensions: [], calls: [], wallet_balance: 0, active_esims: 0 });

      const [extRes, cdrRes, esimRes, flowRes] = await Promise.all([
        supabase.from('pbx_extensions').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('pbx_cdr').select('*').order('started_at', { ascending: false }).limit(10),
        supabase.from('esim_accounts').select('id, iccid, status, wallet_balance, plan_name, data_gb, country_code').order('created_at', { ascending: false }).limit(5),
        supabase.from('pbx_flows').select('*').order('created_at', { ascending: false }).limit(20).catch(() => ({ data: [] })),
      ]);

      const totalWallet = (esimRes.data || []).reduce((s, e) => s + (parseFloat(e.wallet_balance) || 0), 0);
      return json(res, {
        ok: true,
        extensions:     extRes.data  || [],
        recent_calls:   cdrRes.data  || [],
        esims:          esimRes.data || [],
        flows:          flowRes.data || [],
        wallet_balance: Math.round(totalWallet * 100) / 100,
        stats: {
          total_extensions: (extRes.data || []).length,
          active_esims:     (esimRes.data || []).filter(e => e.status === 'active').length,
          total_flows:      (flowRes.data || []).length,
          calls_today:      (cdrRes.data || []).filter(c => c.started_at && c.started_at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
        },
      });
    }

    // ── GET /api/pbx/flows ─────────────────────────────────────────────────────
    if (p === '/api/pbx/flows' && method === 'GET') {
      const user = await extractUser(req);
      if (!user) return json(res, { error: 'Authentication required' }, 401);
      if (!isConfigured) return json(res, { flows: [] });

      const { data, error } = await supabase.from('pbx_flows').select('*').order('created_at', { ascending: false });
      if (error) return json(res, { flows: [] });
      return json(res, { ok: true, flows: data || [], count: (data || []).length });
    }

    // ── POST /api/pbx/flows ────────────────────────────────────────────────────
    if (p === '/api/pbx/flows' && method === 'POST') {
      const user = await extractUser(req);
      if (!user) return json(res, { error: 'Authentication required' }, 401);
      if (!isConfigured) return json(res, { error: 'Database not configured' }, 500);

      const body = await parseBody(req);
      const { name, type, description, config } = body;
      if (!name || !type) return json(res, { error: 'name and type required' }, 400);

      // type: ivr | queue | ring_group | voicemail | forward
      const now = new Date().toISOString();
      const flowConfig = config || {};
      if (type === 'ivr' && !flowConfig.greeting) flowConfig.greeting = `Welcome to ${name}. Press 1 for sales, 2 for support, 0 for operator.`;
      if (type === 'ivr' && !flowConfig.options) flowConfig.options = { '1': 'sales', '2': 'support', '0': 'operator' };
      if (type === 'queue' && !flowConfig.timeout_seconds) flowConfig.timeout_seconds = 60;
      if (type === 'ring_group' && !flowConfig.strategy) flowConfig.strategy = 'simultaneous';

      const { data, error } = await supabase.from('pbx_flows').insert({
        id: crypto.randomUUID(),
        name, type, description: description || null,
        config: flowConfig,
        status: 'active',
        created_at: now,
        updated_at: now,
      }).select().single();

      if (error) return json(res, { error: error.message }, 500);
      return json(res, { ok: true, flow: data }, 201);
    }

    // ── DELETE /api/pbx/flows/:id ──────────────────────────────────────────────
    const flowDelMatch = p.match(/^\/api\/pbx\/flows\/([a-f0-9-]{36})$/);
    if (flowDelMatch && method === 'DELETE') {
      const user = await extractUser(req);
      if (!user) return json(res, { error: 'Authentication required' }, 401);
      await supabase.from('pbx_flows').update({ status: 'archived' }).eq('id', flowDelMatch[1]);
      return json(res, { ok: true });
    }

    // ── GET /api/pbx/wallet ────────────────────────────────────────────────────
    if (p === '/api/pbx/wallet' && method === 'GET') {
      const user = await extractUser(req);
      if (!user) return json(res, { error: 'Authentication required' }, 401);
      if (!isConfigured) return json(res, { wallet_balance: 0, topups: [] });

      const { data: esims } = await supabase.from('esim_accounts').select('id, wallet_balance, plan_name').limit(10);
      const esimIds = (esims || []).map(e => e.id);
      const totalBalance = (esims || []).reduce((s, e) => s + (parseFloat(e.wallet_balance) || 0), 0);

      let topups = [];
      if (esimIds.length) {
        const { data: t } = await supabase.from('esim_topups').select('*').in('esim_id', esimIds).order('created_at', { ascending: false }).limit(20);
        topups = t || [];
      }
      return json(res, { ok: true, wallet_balance: Math.round(totalBalance * 100) / 100, topups, esims: esims || [] });
    }

    // ── POST /api/pbx/wallet/topup ─────────────────────────────────────────────
    if (p === '/api/pbx/wallet/topup' && method === 'POST') {
      const user = await extractUser(req);
      if (!user) return json(res, { error: 'Authentication required' }, 401);
      if (!isConfigured) return json(res, { error: 'Database not configured' }, 500);

      const body = await parseBody(req);
      const { esim_id, amount, type = 'wallet', payment_ref } = body;
      if (!esim_id || !amount) return json(res, { error: 'esim_id and amount required' }, 400);

      const result = await svc.topupESim({ esim_id, type, amount: parseFloat(amount), currency: 'ZAR', payment_ref: payment_ref || `manual_${Date.now()}` });
      if (!result.ok) return json(res, { error: result.error }, 500);

      // Emit invoice to treasury
      if (isConfigured) {
        const now = new Date().toISOString();
        supabase.from('invoices').insert({
          id: crypto.randomUUID(),
          user_id: user.id,
          line_items: [{ description: 'PBX Wallet Top-up', quantity: 1, unit_price: parseFloat(amount), total: parseFloat(amount) }],
          total_amount: parseFloat(amount),
          currency: 'ZAR',
          status: 'paid',
          paid_at: now,
          created_at: now,
          meta: { source: 'pbx_wallet_topup', esim_id, payment_ref: payment_ref || '' },
        }).catch(() => {});
      }

      return json(res, { ok: true, topup: result.topup, new_balance: result.topup?.amount });
    }

    // ── POST /api/pbx/carrier/activate ────────────────────────────────────────
    // Marketplace one-click: creates Bridge AI project + provisions PBX tenant
    if (p === '/api/pbx/carrier/activate' && method === 'POST') {
      const user = await extractUser(req);
      if (!user) return json(res, { error: 'Authentication required' }, 401);
      if (!isConfigured) return json(res, { error: 'Database not configured' }, 500);

      const body = await parseBody(req);
      const { plan_name = 'Global Pro', display_name, country_code = 'ZA' } = body;
      const now = new Date().toISOString();

      // 1. Provision eSIM (carrier account anchor)
      const esimResult = await svc.provisionESim({
        user_id: user.id,
        plan_name,
        country_code,
        name: display_name || user.name || user.email,
        email: user.email,
      });
      if (!esimResult.ok) return json(res, { error: esimResult.error }, 500);

      // 2. Provision PBX extension for this carrier account
      const pbxResult = await svc.provisionPBXExtension({
        esim_id: esimResult.esim.id,
        display_name: display_name || user.name || user.email,
        country: country_code,
      });

      // 3. Create a Bridge AI project representing the carrier account
      const projectId = crypto.randomUUID();
      await supabase.from('projects').insert({
        id: projectId,
        user_id: user.id,
        name: `PBX Carrier — ${display_name || user.email}`,
        tool_id: 'esim',
        intent: `Carrier-grade PBX platform. Plan: ${plan_name}. eSIM + cloud PBX with AI call management.`,
        integration_targets: ['crm', 'billing', 'treasury'],
        scaffold: {
          catalog_id:    'pbx-carrier',
          category:      'telco_esim',
          market:        'Global',
          tech:          ['FreeSWITCH', 'SIP', 'WebRTC', 'AI'],
          esim_id:       esimResult.esim.id,
          iccid:         esimResult.esim.iccid,
          extension:     pbxResult.ok ? pbxResult.extension?.extension : null,
          sip_domain:    'pbx.bridge-ai-os.com',
          app_page_url:  '/esim',
          provisioned_at: now,
        },
        status: 'active',
        run_count: 1,
        output_count: 0,
        created_at: now,
        updated_at: now,
      }).catch(() => {});

      // 4. Seed project run
      await supabase.from('project_runs').insert({
        id: crypto.randomUUID(),
        project_id: projectId,
        tool_id: 'esim',
        agent_ids: [],
        inputs: { source: 'marketplace_activate', plan: plan_name },
        trigger: 'provision',
        status: 'completed',
        started_at: now,
        completed_at: now,
        result: { message: 'PBX carrier account activated', esim_id: esimResult.esim.id },
        error: null, latency_ms: 200, tokens_used: 0, brdg_cost: 0,
      }).catch(() => {});

      // 5. Create CRM contact
      supabase.from('contacts').insert({
        name: display_name || user.name || user.email,
        email: user.email,
        status: 'customer', stage: 'closed_won',
        source: 'pbx_marketplace',
        score: 90,
        tags: ['pbx', 'carrier', plan_name.toLowerCase().replace(/\s+/g, '_')],
        notes: `Activated PBX carrier via marketplace. Plan: ${plan_name}. iccid: ${esimResult.esim.iccid}`,
        meta: { esim_id: esimResult.esim.id, project_id: projectId },
      }).catch(() => {});

      return json(res, {
        ok: true,
        message: 'Carrier account activated',
        project_id: projectId,
        esim: {
          id:           esimResult.esim.id,
          iccid:        esimResult.esim.iccid,
          plan:         plan_name,
          status:       esimResult.esim.status,
          activation_qr: esimResult.qr_url,
          lpa:          esimResult.lpa,
        },
        pbx: pbxResult.ok ? {
          extension:    pbxResult.extension?.extension,
          did_number:   pbxResult.extension?.did_number,
          sip_domain:   'pbx.bridge-ai-os.com',
          sip_username: pbxResult.sip_credentials?.username,
          sip_password: pbxResult.sip_credentials?.password,
        } : null,
        dashboard_url: '/esim',
      }, 201);
    }

    // ── Federation + Reseller + Marketplace ─────────────────────────────────
    const path = url.pathname;
    if (path.startsWith('/api/pbx/reseller')) {
      return handleReseller(req, res);
    }
    if (path.startsWith('/api/pbx/federation')) {
      return handleFederation(req, res);
    }
    if (path.startsWith('/api/pbx/marketplace')) {
      return handlePBXMarketplace(req, res);
    }

    return null; // Not handled — pass to next middleware
  } catch (err) {
    console.error('[eSIM API]', err);
    return json(res, { error: 'Internal server error', detail: err.message }, 500);
  }
}

module.exports = { handleESim };
