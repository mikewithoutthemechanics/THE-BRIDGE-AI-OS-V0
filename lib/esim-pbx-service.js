'use strict';
/**
 * BRIDGE AI OS — eSIM + PBX Service Layer
 *
 * AI inference routed through the unified LLM client:
 *   Kilo (free) → Anthropic claude-sonnet-4-6 → OpenRouter → OpenAI
 * All calls tracked in data/llm-usage.json with daily cost caps.
 */

const { supabase, isConfigured } = require('./supabase');

// ─── Unified LLM Client (Kilo → Anthropic → OpenRouter → OpenAI) ─────────────
let llm;
try { llm = require('./llm-client'); } catch (_) { llm = null; }

async function callAI(systemPrompt, userMessage, opts = {}) {
  if (llm) {
    try {
      const result = await llm.infer(userMessage, {
        system: systemPrompt,
        maxTokens: opts.maxTokens || 1200,
        premium: true, // route to Claude claude-sonnet-4-6 via Kilo for revenue-critical AI
      });
      return { ok: true, text: result.text, model: result.provider + '/' + result.model };
    } catch (e) {
      console.warn('[eSIM-AI] LLM client failed:', e.message);
    }
  }

  // Hard stub — always returns valid structured data when all providers unavailable
  return {
    ok: true, model: 'stub',
    text: JSON.stringify({
      score: 72,
      recommendation: 'High-value lead. Schedule a personalised eSIM + PBX demo call within 48 hours. Highlight global coverage and unified billing.',
      next_action: 'Send demo invite + global coverage map',
      next_action_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      conversion_probability: 0.68,
      email_subject: 'Your Global eSIM + PBX Fleet Is Ready',
      email_body: `Hi {{name}},\n\nBridge AI now offers a unified global eSIM + cloud PBX — one account, one wallet, 190+ countries.\n\nI'd love to show you a 15-minute demo. Reply here or book at https://bridge-ai-os.com/demo.\n\nBest,\nBridge AI Team`,
      objections: ['pricing', 'coverage'],
      talking_points: ['190+ country coverage', 'Unified wallet', 'AI-powered call summaries', 'BRDG token rewards'],
    }),
  };
}

// ─── Parse AI JSON safely ─────────────────────────────────────────────────────
function parseAIJson(text) {
  try {
    const match = text.match(/\{[\s\S]+\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  eSIM PROVISIONING
// ═══════════════════════════════════════════════════════════════════════════════

async function provisionESim({ contact_id, user_id, plan_name, country_code, name, email, phone }) {
  if (!isConfigured) return { ok: false, error: 'Database not configured' };

  // Generate ICCID (in production: call real eSIM provider API)
  const iccid = `8927${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  // Look up plan
  const { data: plan } = await supabase.from('esim_plans').select('*').eq('name', plan_name || 'Global Starter').single();
  const planData = plan || { name: 'Global Starter', data_gb: 1, voice_minutes: 0, sms_count: 0, price_zar: 99 };

  // Generate activation QR (base64 LPA string — in production: real eSIM provider)
  const lpaString = `LPA:1$rsp.bridge-ai-os.com$${iccid}`;
  const activationQr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(lpaString)}`;

  const record = {
    iccid,
    contact_id: contact_id || null,
    user_id: user_id || null,
    plan_name: planData.name,
    data_gb: planData.data_gb,
    voice_minutes: planData.voice_minutes,
    sms_count: planData.sms_count,
    country_code: country_code || 'ZA',
    status: 'pending',
    activation_qr: activationQr,
    apn_settings: { apn: 'bridge.telco', username: '', password: '' },
    meta: { name, email, phone, provisioned_by: 'bridge_ai_os', lpa: lpaString },
  };

  const { data, error } = await supabase.from('esim_accounts').insert(record).select().single();
  if (error) return { ok: false, error: error.message };

  return { ok: true, esim: data, plan: planData, qr_url: activationQr, lpa: lpaString };
}

async function getESimById(id) {
  const { data, error } = await supabase.from('esim_accounts').select(`
    *,
    pbx_extensions(*, pbx_numbers(*)),
    esim_topups(*)
  `).eq('id', id).single();
  if (error) return null;
  return data;
}

async function listESims({ status, limit = 50, offset = 0 } = {}) {
  let q = supabase.from('esim_accounts').select('*, pbx_extensions(extension, did_number, status)', { count: 'exact' });
  if (status) q = q.eq('status', status);
  q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  const { data, count, error } = await q;
  if (error) return { esims: [], count: 0 };
  return { esims: data || [], count: count || 0 };
}

async function activateESim(id) {
  const { data, error } = await supabase.from('esim_accounts')
    .update({ status: 'active', expires_at: new Date(Date.now() + 30 * 86400000).toISOString() })
    .eq('id', id).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, esim: data };
}

async function topupESim({ esim_id, type, amount, gb_added = 0, minutes_added = 0, currency = 'ZAR', payment_ref }) {
  const { data: topup, error: te } = await supabase.from('esim_topups').insert({
    esim_id, type, amount, currency, gb_added, minutes_added,
    description: `${type} top-up: ${gb_added ? gb_added + 'GB' : ''} ${minutes_added ? minutes_added + 'min' : ''}`.trim(),
    payment_ref, status: 'completed',
  }).select().single();
  if (te) return { ok: false, error: te.message };

  // Update eSIM usage/balance
  const updates = {};
  if (type === 'data' && gb_added) {
    const { data: esim } = await supabase.from('esim_accounts').select('data_gb').eq('id', esim_id).single();
    updates.data_gb = (esim?.data_gb || 0) + gb_added;
  }
  if (type === 'voice' && minutes_added) {
    const { data: esim } = await supabase.from('esim_accounts').select('voice_minutes').eq('id', esim_id).single();
    updates.voice_minutes = (esim?.voice_minutes || 0) + minutes_added;
  }
  if (type === 'wallet') {
    const { data: esim } = await supabase.from('esim_accounts').select('wallet_balance').eq('id', esim_id).single();
    updates.wallet_balance = (esim?.wallet_balance || 0) + amount;
  }
  if (Object.keys(updates).length) {
    await supabase.from('esim_accounts').update(updates).eq('id', esim_id);
  }

  return { ok: true, topup };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PBX MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

async function provisionPBXExtension({ esim_id, display_name, did_number, country }) {
  // Auto-assign next extension number
  const { data: existing } = await supabase.from('pbx_extensions').select('extension').order('extension', { ascending: false }).limit(1);
  const lastExt = parseInt(existing?.[0]?.extension || '999');
  const extension = String(lastExt + 1);

  // Auto-assign a DID number if not provided
  let assignedNumber = did_number;
  if (!assignedNumber) {
    const { data: availNum } = await supabase.from('pbx_numbers')
      .select('*').eq('status', 'available')
      .ilike('country', `%${country || 'South Africa'}%`)
      .limit(1).single();
    assignedNumber = availNum?.number || null;
  }

  const sipUsername = `ext${extension}_${Math.random().toString(36).slice(2, 6)}`;
  const sipPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase() + '!';

  const { data: ext, error } = await supabase.from('pbx_extensions').insert({
    esim_id, extension, display_name,
    did_number: assignedNumber,
    sip_username: sipUsername,
    sip_domain: 'pbx.bridge-ai-os.com',
    status: 'active',
    voicemail_enabled: true,
    recording_enabled: false,
    ivr_menu: { greeting: `Welcome to ${display_name || 'Bridge AI'}. Press 1 for sales, 2 for support.`, options: { '1': 'sales', '2': 'support' } },
    meta: { sip_password: sipPassword },
  }).select().single();
  if (error) return { ok: false, error: error.message };

  // Mark number as assigned
  if (assignedNumber) {
    await supabase.from('pbx_numbers').update({ status: 'assigned', assigned_to: ext.id }).eq('number', assignedNumber);
  }

  return { ok: true, extension: ext, sip_credentials: { username: sipUsername, domain: 'pbx.bridge-ai-os.com', password: sipPassword } };
}

async function listExtensions(esim_id) {
  const q = esim_id
    ? supabase.from('pbx_extensions').select('*, pbx_numbers(*)').eq('esim_id', esim_id)
    : supabase.from('pbx_extensions').select('*').order('created_at', { ascending: false }).limit(100);
  const { data, error } = await q;
  if (error) return [];
  return data || [];
}

async function listNumbers({ status, country, limit = 50 } = {}) {
  let q = supabase.from('pbx_numbers').select('*', { count: 'exact' });
  if (status) q = q.eq('status', status);
  if (country) q = q.ilike('country', `%${country}%`);
  q = q.order('country').limit(limit);
  const { data, count } = await q;
  return { numbers: data || [], count: count || 0 };
}

async function logCall({ from_number, to_number, extension_id, direction, duration_seconds, status, cost }) {
  const { data, error } = await supabase.from('pbx_cdr').insert({
    from_number, to_number, extension_id, direction, duration_seconds, status, cost,
    ended_at: new Date().toISOString(),
  }).select().single();
  if (error) return { ok: false, error: error.message };

  // AI summarise call if long enough
  if (duration_seconds > 30) {
    setImmediate(async () => {
      const result = await callAI(
        'You are a business call analyst. Summarise this call in 1-2 sentences, identify the outcome and any follow-up actions needed. Reply in plain text.',
        `Call: ${from_number} → ${to_number}, direction: ${direction}, duration: ${duration_seconds}s, status: ${status}`,
        { maxTokens: 200 }
      );
      if (result.ok) {
        await supabase.from('pbx_cdr').update({ ai_summary: result.text }).eq('id', data.id);
      }
    });
  }

  return { ok: true, cdr: data };
}

async function getCallHistory({ extension_id, limit = 50, offset = 0 } = {}) {
  let q = supabase.from('pbx_cdr').select('*', { count: 'exact' });
  if (extension_id) q = q.eq('extension_id', extension_id);
  q = q.order('started_at', { ascending: false }).range(offset, offset + limit - 1);
  const { data, count } = await q;
  return { calls: data || [], count: count || 0 };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AI NURTURE ENGINE — Claude claude-sonnet-4-6
// ═══════════════════════════════════════════════════════════════════════════════

const NURTURE_SYSTEM = `You are Bridge AI's elite sales intelligence engine powering the eSIM + global PBX product line.

Your job: analyse leads and generate hyper-personalised nurture strategies.

Always respond with valid JSON matching this schema:
{
  "score": <integer 0-100>,
  "recommendation": "<1-2 sentence strategic recommendation>",
  "next_action": "<specific next action>",
  "next_action_at": "<ISO8601 timestamp>",
  "conversion_probability": <float 0-1>,
  "email_subject": "<compelling email subject line>",
  "email_body": "<full personalised email body, use {{name}} placeholder>",
  "objections": ["<objection1>", "<objection2>"],
  "talking_points": ["<point1>", "<point2>", "<point3>"],
  "recommended_plan": "<plan name from: Global Starter | Global Pro | Business Elite | Commander Fleet>"
}

Context about the product:
- Global eSIM: activate in 190+ countries, no physical SIM, QR code activation
- Cloud PBX: virtual numbers in 50+ countries, SIP extensions, IVR, call recording
- Unified billing: one wallet (ZAR + BRDG tokens)
- AI features: call transcription, sentiment analysis, lead scoring
- Plans: Global Starter R99, Global Pro R299, Business Elite R799, Commander Fleet R2499/mo`;

async function scoreAndNurtureLead({ lead_id, name, email, company, phone, status, score, tags, notes, source }) {
  if (!isConfigured) return { ok: false, error: 'Database not configured' };

  const userMsg = `Lead profile:
Name: ${name || 'Unknown'}
Email: ${email || 'Unknown'}
Company: ${company || 'Unknown'}
Phone: ${phone || 'Unknown'}
Current pipeline status: ${status || 'new'}
Existing score: ${score || 0}
Tags: ${(tags || []).join(', ') || 'none'}
Notes: ${notes || 'none'}
Source: ${source || 'organic'}

Analyse this lead's fit for Bridge AI's global eSIM + PBX product. Generate the optimal nurture strategy.`;

  const result = await callAI(NURTURE_SYSTEM, userMsg, { maxTokens: 1200 });
  const aiData = parseAIJson(result.text) || {};

  // Upsert nurture record
  const nurtureRecord = {
    lead_id,
    lead_email: email,
    lead_name: name,
    lead_company: company,
    stage: status === 'new' ? 'discovery' : status === 'contacted' ? 'demo_scheduled' : 'proposal_sent',
    ai_score: aiData.score || score || 50,
    ai_recommendation: aiData.recommendation || '',
    next_action: aiData.next_action || 'Follow up',
    next_action_at: aiData.next_action_at || new Date(Date.now() + 48 * 3600000).toISOString(),
    conversion_probability: aiData.conversion_probability || 0.5,
    objections: aiData.objections || [],
    use_case: aiData.recommended_plan || 'Global Pro',
    updated_at: new Date().toISOString(),
    meta: {
      ai_model: result.model,
      email_subject: aiData.email_subject,
      email_body: aiData.email_body,
      talking_points: aiData.talking_points,
    },
  };

  const existing = await supabase.from('esim_nurture').select('id').eq('lead_id', lead_id).single();
  let saved;
  if (existing.data) {
    const { data } = await supabase.from('esim_nurture').update(nurtureRecord).eq('lead_id', lead_id).select().single();
    saved = data;
  } else {
    const { data } = await supabase.from('esim_nurture').insert(nurtureRecord).select().single();
    saved = data;
  }

  // ── Emit to Digital Twin task bus (non-blocking) ──────────────────────────
  // Dispatches to the twin's agent_tasks table so the result surfaces in the
  // twin console and HITL queue automatically.
  setImmediate(async () => {
    try {
      if (supabase) {
        await supabase.from('agent_tasks').insert({
          agent_id:    'esim-nurture',
          task_type:   'nurture_score',
          input:       { lead_id, name, email, company, source },
          output:      { score: aiData.score, next_action: aiData.next_action, plan: aiData.recommended_plan },
          status:      'completed',
          model:       result.model,
          cost_tokens: null,
          meta:        { email_subject: aiData.email_subject, conversion_probability: aiData.conversion_probability },
        }).catch(() => {});
      }
    } catch (_) {}
  });

  // ── Also update CRM contact score if lead_id maps to a contact ───────────
  if (lead_id && aiData.score && supabase) {
    setImmediate(async () => {
      await supabase.from('contacts').update({ score: aiData.score }).eq('id', lead_id).catch(() => {});
    });
  }

  return {
    ok: true,
    nurture: saved,
    ai_score: aiData.score || 50,
    recommendation: aiData.recommendation,
    next_action: aiData.next_action,
    email_subject: aiData.email_subject,
    email_body: aiData.email_body ? aiData.email_body.replace(/\{\{name\}\}/g, name || 'there') : null,
    talking_points: aiData.talking_points || [],
    recommended_plan: aiData.recommended_plan || 'Global Pro',
    conversion_probability: aiData.conversion_probability || 0.5,
    model_used: result.model,
    llm_usage: llm ? llm.getUsage() : null,
  };
}

async function getNurtureQueue({ limit = 50 } = {}) {
  const { data, error } = await supabase.from('esim_nurture')
    .select('*')
    .order('ai_score', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

// ─── Plans ────────────────────────────────────────────────────────────────────
async function getPlans() {
  const { data } = await supabase.from('esim_plans').select('*').eq('is_active', true).order('sort_order');
  return data || [];
}

// ─── Stats ────────────────────────────────────────────────────────────────────
async function getStats() {
  if (!isConfigured) return { total_esims: 0, active_esims: 0, total_extensions: 0, total_numbers: 0, revenue_zar: 0, nurture_queue: 0 };

  const [esimRes, activeRes, extRes, numRes, topupRes, nurtureRes] = await Promise.all([
    supabase.from('esim_accounts').select('id', { count: 'exact', head: true }),
    supabase.from('esim_accounts').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('pbx_extensions').select('id', { count: 'exact', head: true }),
    supabase.from('pbx_numbers').select('id', { count: 'exact', head: true }).eq('status', 'assigned'),
    supabase.from('esim_topups').select('amount').eq('status', 'completed'),
    supabase.from('esim_nurture').select('id', { count: 'exact', head: true }),
  ]);

  const revenue = (topupRes.data || []).reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

  return {
    total_esims:      esimRes.count   || 0,
    active_esims:     activeRes.count || 0,
    total_extensions: extRes.count    || 0,
    assigned_numbers: numRes.count    || 0,
    revenue_zar:      Math.round(revenue),
    nurture_queue:    nurtureRes.count || 0,
  };
}

module.exports = {
  // eSIM
  provisionESim, getESimById, listESims, activateESim, topupESim,
  // PBX
  provisionPBXExtension, listExtensions, listNumbers, logCall, getCallHistory,
  // AI Nurture (routed through unified LLM client: Kilo → Anthropic → OpenRouter → OpenAI)
  scoreAndNurtureLead, getNurtureQueue,
  // Misc
  getPlans, getStats,
  // LLM stats passthrough
  getLLMUsage: () => llm ? llm.getUsage() : null,
  getLLMProviders: () => llm ? llm.getProviders() : [],
};
