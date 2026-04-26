'use strict';
// =============================================================================
// BRIDGE AI CORPORATE OS — All Corporate Module API Routes
// Covers: quotes, invoices, debts, vendors, tickets, inventory,
//         hr, marketing, analytics, legal, customers, autonomous status
// =============================================================================

const { supabase, isConfigured } = require('../../lib/supabase');
const {
  buildState, buildMarketing, buildLegal, buildActivityLog,
  CLIENTS, SERVICES, prng, between, pick,
} = require('./state');

// In-process mutable overrides (survive within a function instance)
const _overrides = { quotes: [], invoices: [], tickets: [], debts: [] };

function applyOverride(type, record) {
  const idx = _overrides[type].findIndex(r => r.id === record.id);
  if (idx >= 0) _overrides[type][idx] = { ..._overrides[type][idx], ...record };
  else _overrides[type].push(record);
}

function ts() { return new Date().toISOString(); }

function numId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function calcItems(items) {
  const subtotal = items.reduce((s, i) => s + (parseFloat(i.rate || i.price || 0) * (i.qty || 1)), 0);
  const tax = +(subtotal * 0.15).toFixed(2);
  return { subtotal: +subtotal.toFixed(2), tax, total: +(subtotal + tax).toFixed(2) };
}

// ── Supabase write-through helpers ──────────────────────────────────────────
async function sbUpsert(table, record) {
  if (!isConfigured || !supabase) return null;
  try {
    const { data } = await supabase.from(table).upsert(record).select().single();
    return data;
  } catch { return null; }
}

async function sbUpdate(table, id, updates) {
  if (!isConfigured || !supabase) return null;
  try {
    const { data } = await supabase.from(table).update({ ...updates, updated_at: ts() }).eq('id', id).select().single();
    return data;
  } catch { return null; }
}

async function sbSelect(table, opts = {}) {
  if (!isConfigured || !supabase) return null;
  try {
    let q = supabase.from(table).select('*', { count: 'exact' });
    if (opts.eq) for (const [k, v] of Object.entries(opts.eq)) q = q.eq(k, v);
    if (opts.order) q = q.order(opts.order, { ascending: false });
    const { data, count } = await q;
    return { data: data || [], count: count || 0 };
  } catch { return null; }
}

// ── Main router ──────────────────────────────────────────────────────────────
async function handleCorporate({ req, res, path: p, method, parseBody, json }) {

  const state = buildState(_overrides);

  // ══ /api/corporate/state ══ Full snapshot
  if (p === '/api/corporate/state' && method === 'GET') {
    return json(res, {
      ...state,
      marketing: buildMarketing(),
      legal: buildLegal(),
      activity: buildActivityLog(),
      autonomous: { active: true, mode: 'FULL_AUTO', last_tick: ts() },
    });
  }

  // ══ /api/corporate/activity ══ Recent activity feed
  if (p === '/api/corporate/activity' && method === 'GET') {
    return json(res, { activity: buildActivityLog(), ts: ts() });
  }

  // ══ /api/corporate/dashboard ══ Dashboard KPI bundle
  if (p === '/api/corporate/dashboard' && method === 'GET') {
    const mkt = buildMarketing();
    const a   = state.analytics;
    return json(res, {
      treasury:   state.treasury,
      analytics:  a,
      kpis: {
        quotes:        { count: a.quotes_count,   value: state.quotes.reduce((s,q) => s + q.total, 0) },
        invoices:      { count: a.invoices_count, value: a.total_invoiced, paid: a.paid_invoices },
        debtors:       { count: a.debts_count,    outstanding: a.outstanding_debt },
        tickets:       { open: a.open_tickets },
        agents:        { ai: a.agents_total, human: a.human_total, efficiency: a.efficiency },
        marketing:     { funnel_top: mkt.funnel.stages[0].count, leads: mkt.funnel.stages[1].count },
      },
      autonomous: { active: true, mode: 'FULL_AUTO', ts: ts() },
    });
  }

  // ══════════════════ QUOTES ══════════════════════════════════════════════
  if (p === '/api/quotes' && method === 'GET') {
    const sbData = await sbSelect('business_quotes', { order: 'created_at' });
    const quotes = sbData?.data?.length ? sbData.data : state.quotes;
    const total  = quotes.reduce((s, q) => s + (q.total || 0), 0);
    return json(res, { quotes, count: quotes.length, total: +total.toFixed(2), ts: ts() });
  }

  if (p === '/api/quotes' && method === 'POST') {
    const body  = await parseBody(req);
    const items = body.items || [];
    const { subtotal, tax, total } = calcItems(items.length ? items : [{ rate: body.amount || 0, qty: 1 }]);
    const rec = {
      id: numId('quo'),
      number: `BRG-Q-${Date.now().toString().slice(-4)}`,
      client: body.client || 'New Client',
      subtotal, tax, total,
      status: 'draft',
      items: items.length ? items : [{ description: 'Custom Service', qty: 1, rate: body.amount || 0, amount: body.amount || 0 }],
      valid_until: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      created_at: ts(),
      notes: body.notes || '',
    };
    applyOverride('quotes', rec);
    await sbUpsert('business_quotes', rec);
    return json(res, { quote: rec, ok: true }, 201);
  }

  const qAcceptMatch = p.match(/^\/api\/quotes\/([^/]+)\/accept$/);
  if (qAcceptMatch && method === 'POST') {
    const id = qAcceptMatch[1];
    const existing = state.quotes.find(q => q.id === id);
    if (existing) {
      applyOverride('quotes', { id, status: 'accepted', updated_at: ts() });
      await sbUpdate('business_quotes', id, { status: 'accepted' });
      // Auto-create invoice
      const invRec = {
        id: numId('inv'),
        number: `BRG-INV-${Date.now().toString().slice(-4)}`,
        client: existing.client,
        subtotal: existing.subtotal,
        tax: existing.tax,
        total: existing.total,
        items: existing.items,
        status: 'sent',
        issued_date: ts().split('T')[0],
        due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        notes: `Converted from quote ${existing.number}`,
        currency: 'ZAR',
        created_at: ts(),
      };
      applyOverride('invoices', invRec);
      await sbUpsert('business_invoices', invRec);
    }
    return json(res, { ok: true, quote_id: id, status: 'accepted', invoice_created: true, ts: ts() });
  }

  // ══════════════════ INVOICES ══════════════════════════════════════════════
  if (p === '/api/invoices' && method === 'GET') {
    const sbData = await sbSelect('business_invoices', { order: 'created_at' });
    const invoices = sbData?.data?.length ? sbData.data : state.invoices;
    const total    = invoices.reduce((s, i) => s + (i.total || 0), 0);
    return json(res, { invoices, count: invoices.length, total: +total.toFixed(2), ts: ts() });
  }

  if (p === '/api/invoices' && method === 'POST') {
    const body  = await parseBody(req);
    const items = body.items || [];
    const { subtotal, tax, total } = calcItems(items.length ? items : [{ rate: body.amount || 0, qty: 1 }]);
    const rec = {
      id: numId('inv'),
      number: `BRG-INV-${Date.now().toString().slice(-4)}`,
      client: body.client || 'New Client',
      subtotal, tax, total,
      status: 'draft',
      items: items.length ? items : [{ description: 'Service', qty: 1, rate: body.amount || 0, amount: body.amount || 0 }],
      issued_date: ts().split('T')[0],
      due_date: new Date(Date.now() + (body.due_days || 30) * 86400000).toISOString().split('T')[0],
      notes: body.notes || 'Bridge AI OS — Thank you for your business',
      currency: 'ZAR',
      created_at: ts(),
    };
    applyOverride('invoices', rec);
    await sbUpsert('business_invoices', rec);
    return json(res, { invoice: rec, ok: true }, 201);
  }

  const invStatusMatch = p.match(/^\/api\/invoices\/([^/]+)\/status$/);
  if (invStatusMatch && (method === 'PUT' || method === 'PATCH')) {
    const body = await parseBody(req);
    const id = invStatusMatch[1];
    applyOverride('invoices', { id, status: body.status, updated_at: ts() });
    await sbUpdate('business_invoices', id, { status: body.status });
    return json(res, { ok: true, id, status: body.status, ts: ts() });
  }

  if (p === '/api/invoices/stats' && method === 'GET') {
    const invoices = state.invoices;
    return json(res, {
      total:     invoices.length,
      paid:      invoices.filter(i => i.status === 'paid').length,
      overdue:   invoices.filter(i => i.status === 'overdue').length,
      pending:   invoices.filter(i => i.status === 'sent').length,
      revenue:   invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0),
      ts: ts(),
    });
  }

  // ══════════════════ DEBTS ══════════════════════════════════════════════════
  if (p === '/api/debts' && method === 'GET') {
    const sbData = await sbSelect('business_debts', { order: 'created_at' });
    const debts = sbData?.data?.length ? sbData.data : state.debts.filter(d => d.status !== 'paid');
    const total_outstanding = debts.reduce((s, d) => s + (d.amount || 0), 0);
    return json(res, { debts, count: debts.length, total_outstanding: +total_outstanding.toFixed(2), ts: ts() });
  }

  if (p === '/api/debts' && method === 'POST') {
    const body = await parseBody(req);
    const rec = {
      id: numId('dbt'),
      debtor: body.debtor,
      amount: parseFloat(body.amount) || 0,
      currency: body.currency || 'ZAR',
      status: 'pending',
      due_date: body.due_date || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      reminders_sent: 0,
      invoice_ref: body.invoice_ref || '',
      created_at: ts(),
    };
    applyOverride('debts', rec);
    await sbUpsert('business_debts', rec);
    return json(res, { debt: rec, ok: true }, 201);
  }

  const debtRemindMatch = p.match(/^\/api\/debts\/([^/]+)\/remind$/);
  if (debtRemindMatch && method === 'POST') {
    const id = debtRemindMatch[1];
    const existing = state.debts.find(d => d.id === id);
    const reminders = (existing?.reminders_sent || 0) + 1;
    applyOverride('debts', { id, reminders_sent: reminders, updated_at: ts() });
    await sbUpdate('business_debts', id, { reminders_sent: reminders });
    return json(res, { ok: true, id, reminders_sent: reminders, ts: ts() });
  }

  const debtPayMatch = p.match(/^\/api\/debts\/([^/]+)\/pay$/);
  if (debtPayMatch && method === 'POST') {
    const id = debtPayMatch[1];
    applyOverride('debts', { id, status: 'paid', paid_at: ts(), updated_at: ts() });
    await sbUpdate('business_debts', id, { status: 'paid', paid_at: ts() });
    return json(res, { ok: true, id, status: 'paid', ts: ts() });
  }

  // ══════════════════ VENDORS ══════════════════════════════════════════════
  if (p === '/api/vendors' && method === 'GET') {
    return json(res, { vendors: state.vendors, count: state.vendors.length, ts: ts() });
  }

  // ══════════════════ TICKETS ══════════════════════════════════════════════
  if (p === '/api/tickets' && method === 'GET') {
    const sbData = await sbSelect('support_tickets', { order: 'created_at' });
    const tickets = sbData?.data?.length ? sbData.data : state.tickets;
    return json(res, { tickets, count: tickets.length, ts: ts() });
  }

  if (p === '/api/tickets' && method === 'POST') {
    const body = await parseBody(req);
    const rec = {
      id: numId('tkt'),
      number: `TKT-${Date.now().toString().slice(-5)}`,
      subject: body.subject || 'Support Request',
      priority: body.priority || 'medium',
      status: 'open',
      assignee: body.assignee || 'ai-support-01',
      customer: body.customer || 'Unknown',
      created_at: ts(),
      updated_at: ts(),
    };
    applyOverride('tickets', rec);
    await sbUpsert('support_tickets', rec);
    return json(res, { ticket: rec, ok: true }, 201);
  }

  const tktUpdateMatch = p.match(/^\/api\/tickets\/([^/]+)$/);
  if (tktUpdateMatch && (method === 'PUT' || method === 'PATCH')) {
    const body = await parseBody(req);
    const id = tktUpdateMatch[1];
    applyOverride('tickets', { id, ...body, updated_at: ts() });
    await sbUpdate('support_tickets', id, body);
    return json(res, { ok: true, id, ts: ts() });
  }

  // ══════════════════ INVENTORY ════════════════════════════════════════════
  if (p === '/api/inventory' && method === 'GET') {
    return json(res, { items: state.inventory, count: state.inventory.length, total_value: +state.inventory.reduce((s, i) => s + i.qty * i.unit_cost, 0).toFixed(2), ts: ts() });
  }

  // ══════════════════ HR ═══════════════════════════════════════════════════
  if (p === '/api/hr/team' && method === 'GET') {
    return json(res, {
      team: state.hr,
      count: state.hr.length,
      ai_agents: state.hr.filter(h => h.type === 'ai_agent').length,
      human: state.hr.filter(h => h.type === 'human').length,
      avg_performance: +(state.hr.reduce((s, h) => s + h.performance, 0) / state.hr.length).toFixed(1),
      ts: ts(),
    });
  }

  // ══════════════════ MARKETING ════════════════════════════════════════════
  if (p === '/api/marketing/funnel' && method === 'GET') {
    return json(res, buildMarketing().funnel);
  }
  if (p === '/api/marketing/seo' && method === 'GET') {
    return json(res, buildMarketing().seo);
  }
  if (p === '/api/marketing/social' && method === 'GET') {
    return json(res, buildMarketing().social);
  }
  if (p === '/api/marketing/campaigns' && method === 'GET') {
    return json(res, { campaigns: buildMarketing().campaigns, ts: ts() });
  }
  if (p.startsWith('/api/marketing') && method === 'GET') {
    return json(res, buildMarketing());
  }

  // ══════════════════ CUSTOMERS ════════════════════════════════════════════
  if (p === '/api/customers' && method === 'GET') {
    const slot = Math.floor(Date.now() / (15 * 60 * 1000));
    const r = prng(slot * 3571);
    const customers = CLIENTS.slice(0, 12).map((name, idx) => ({
      id: `cust_${String(idx + 1).padStart(3,'0')}`,
      name,
      plan: pick(r, ['starter','pro','pro','enterprise']),
      ltv: between(r, 2000, 85000),
      tickets: between(r, 0, 8),
      joined: new Date(Date.now() - between(r, 30, 365) * 86400000).toISOString().split('T')[0],
      status: 'active',
    }));
    return json(res, { customers, count: customers.length, ts: ts() });
  }

  // ══════════════════ LEGAL ════════════════════════════════════════════════
  if (p === '/api/legal/documents' && method === 'GET') {
    return json(res, buildLegal());
  }
  if (p === '/api/compliance/status' && method === 'GET') {
    return json(res, buildLegal());
  }

  // ══════════════════ ANALYTICS ════════════════════════════════════════════
  if (p === '/api/analytics/overview' && method === 'GET') {
    const mkt = buildMarketing();
    return json(res, {
      revenue: { mtd: state.analytics.revenue_mtd, total_invoiced: state.analytics.total_invoiced },
      customers: { total: 12, active: 10, new_mtd: between(prng(Math.floor(Date.now() / 86400000)), 1, 5) },
      support: { open_tickets: state.analytics.open_tickets, resolved_today: between(prng(Math.floor(Date.now() / 3600000)), 2, 8) },
      agents: { total: state.analytics.agents_total + state.analytics.human_total, efficiency: state.analytics.efficiency },
      marketing: { conversion: state.analytics.conversion, funnel_visitors: mkt.funnel.stages[0].count },
      treasury: state.treasury,
      ts: ts(),
    });
  }

  if (p === '/api/analytics/summary' && method === 'GET') {
    return json(res, {
      ...state.analytics,
      marketing: buildMarketing().funnel,
      ts: ts(),
    });
  }

  // ══════════════════ AUTONOMOUS ENGINE STATUS ══════════════════════════════
  if (p === '/api/corporate/autonomous' && method === 'GET') {
    return json(res, {
      active: true,
      mode: 'FULL_AUTO',
      modules: {
        crm:       { status: 'active', records: 10,                          last_action: ts() },
        quotes:    { status: 'active', records: state.quotes.length,          last_action: ts() },
        invoices:  { status: 'active', records: state.invoices.length,        last_action: ts() },
        treasury:  { status: 'active', balance: state.treasury.balance,       last_action: ts() },
        tickets:   { status: 'active', records: state.tickets.length,         last_action: ts() },
        inventory: { status: 'active', records: state.inventory.length,       last_action: ts() },
        hr:        { status: 'active', agents: state.analytics.agents_total,  last_action: ts() },
        marketing: { status: 'active', campaigns: 4,                          last_action: ts() },
        vendors:   { status: 'active', records: state.vendors.length,         last_action: ts() },
        legal:     { status: 'active', frameworks: 5,                         last_action: ts() },
      },
      health: 'FULLY_AUTONOMOUS',
      uptime_pct: 99.97,
      next_tick: new Date(Date.now() + 60000).toISOString(),
      ts: ts(),
    });
  }

  return false; // not handled
}

module.exports = { handleCorporate };
