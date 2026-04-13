'use strict';
// =============================================================================
// BRIDGE AI CORPORATE OS — Autonomous Cron Engine
// Runs every minute (Vercel cron). Generates new business data, progresses
// stuck workflows, updates treasury, creates activity events.
// Writes all actions to Supabase when configured.
// =============================================================================

const { supabase, isConfigured } = require('../../lib/supabase');
const {
  buildState, buildActivityLog,
  CLIENTS, SERVICES, prng, between, pick,
} = require('../corporate/state');

function ts() { return new Date().toISOString(); }
function numId(p) { return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`; }
function calcTax(subtotal) { return { subtotal: +subtotal.toFixed(2), tax: +(subtotal * 0.15).toFixed(2), total: +(subtotal * 1.15).toFixed(2) }; }

// ── Safe Supabase helpers ──────────────────────────────────────────────────
async function sbInsert(table, row) {
  if (!isConfigured || !supabase) return null;
  try { const { data } = await supabase.from(table).insert(row).select().single(); return data; }
  catch (e) { console.warn(`[CorpEngine] insert ${table}:`, e.message); return null; }
}

async function sbUpdate(table, id, updates) {
  if (!isConfigured || !supabase) return null;
  try { const { data } = await supabase.from(table).update({ ...updates, updated_at: ts() }).eq('id', id).select().single(); return data; }
  catch (e) { console.warn(`[CorpEngine] update ${table}:`, e.message); return null; }
}

async function sbGetStuck(table, staleMinutes = 30) {
  if (!isConfigured || !supabase) return [];
  try {
    const cutoff = new Date(Date.now() - staleMinutes * 60000).toISOString();
    const { data } = await supabase.from(table).select('*').lt('updated_at', cutoff).limit(5);
    return data || [];
  } catch { return []; }
}

// ── Action generators ──────────────────────────────────────────────────────
async function generateLead(r) {
  const rec = {
    id: numId('lead'),
    company_id: '00000000-0000-0000-0000-000000000001',
    name: pick(r, ['Alex Dube','Priya Naidoo','James Mthembu','Nomsa Zulu','Carlos Baloyi','Lin Zhang','Sara Botha','Mohammed Patel']),
    email: `lead.${Date.now().toString(36)}@${pick(r, ['techventures.co.za','innovate.io','corp.com','solutions.co.za'])}`,
    company_name: pick(r, CLIENTS),
    status: 'lead',
    stage: 'new',
    value: between(r, 5000, 250000),
    score: between(r, 45, 95),
    source: pick(r, ['website_form','social_linkedin','referral_program','cold_outreach','event_webinar']),
    industry: pick(r, ['Technology','Finance','Healthcare','Manufacturing','Consulting','Education']),
    tags: [pick(r, ['enterprise','mid-market','smb']), pick(r, ['high-value','warm','cold'])],
    created_at: ts(),
    updated_at: ts(),
  };
  await sbInsert('contacts', rec);
  return { type: 'lead_created', data: rec };
}

async function generateQuote(r) {
  const svc = SERVICES[Math.floor(r() * SERVICES.length)];
  const qty = between(r, 1, 4);
  const sub = svc.price * qty;
  const { subtotal, tax, total } = calcTax(sub);
  const client = pick(r, CLIENTS);
  const rec = {
    id: numId('quo'),
    number: `BRG-Q-${Date.now().toString().slice(-4)}`,
    client, subtotal, tax, total,
    status: pick(r, ['draft','draft','sent']),
    items: [{ description: svc.name, qty, rate: svc.price, amount: svc.price * qty }],
    valid_until: new Date(Date.now() + between(r, 7, 21) * 86400000).toISOString().split('T')[0],
    notes: 'Bridge AI OS — Automated quote generation',
    currency: 'ZAR',
    created_at: ts(),
    updated_at: ts(),
  };
  await sbInsert('business_quotes', rec);
  return { type: 'quote_generated', data: rec };
}

async function convertQuoteToInvoice(quote, r) {
  // Accept the quote
  await sbUpdate('business_quotes', quote.id, { status: 'accepted' });
  // Create invoice
  const invRec = {
    id: numId('inv'),
    number: `BRG-INV-${Date.now().toString().slice(-4)}`,
    client: quote.client,
    subtotal: quote.subtotal,
    tax: quote.tax,
    total: quote.total,
    items: quote.items,
    status: 'sent',
    issued_date: ts().split('T')[0],
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    notes: `Auto-converted from quote ${quote.number}`,
    currency: quote.currency || 'ZAR',
    created_at: ts(),
    updated_at: ts(),
  };
  await sbInsert('business_invoices', invRec);
  return { type: 'quote_converted', data: { quote: quote.id, invoice: invRec.id } };
}

async function processInvoicePayment(invoice) {
  await sbUpdate('business_invoices', invoice.id, { status: 'paid', paid_at: ts() });
  // Update treasury
  try {
    if (isConfigured && supabase) {
      await supabase.rpc('increment_treasury', { amount: invoice.total || 0 }).catch(() => null);
    }
  } catch {}
  return { type: 'invoice_paid', data: { invoice: invoice.id, amount: invoice.total } };
}

async function generateTicket(r) {
  const subjects = [
    'Dashboard loading slowly','New feature configuration request',
    'API authentication failing','Billing inquiry','AI agent optimization',
    'Custom integration needed','Performance report request',
  ];
  const rec = {
    id: numId('tkt'),
    number: `TKT-${Date.now().toString().slice(-5)}`,
    subject: pick(r, subjects),
    priority: pick(r, ['low','medium','medium','high']),
    status: 'open',
    assignee: pick(r, ['ai-support-01','ai-support-02','ai-support-03']),
    customer: pick(r, CLIENTS),
    created_at: ts(),
    updated_at: ts(),
  };
  await sbInsert('support_tickets', rec);
  return { type: 'ticket_created', data: rec };
}

async function resolveStuckTicket(ticket) {
  const newStatus = ticket.status === 'open' ? 'pending' : 'resolved';
  await sbUpdate('support_tickets', ticket.id, { status: newStatus });
  return { type: 'ticket_progressed', data: { id: ticket.id, from: ticket.status, to: newStatus } };
}

async function sendDebtReminder(debt) {
  const reminders = (debt.reminders_sent || 0) + 1;
  const newStatus = reminders >= 3 ? 'overdue' : debt.status;
  await sbUpdate('business_debts', debt.id, { reminders_sent: reminders, status: newStatus });
  return { type: 'debt_reminder_sent', data: { id: debt.id, reminders_sent: reminders } };
}

// ── Self-healing: detect and repair broken workflows ───────────────────────
async function healWorkflows() {
  const healed = [];

  if (!isConfigured || !supabase) return healed;

  // Find draft quotes older than 48h — auto-send them
  try {
    const cutoff = new Date(Date.now() - 48 * 3600000).toISOString();
    const { data: staleQuotes } = await supabase
      .from('business_quotes')
      .select('*')
      .eq('status', 'draft')
      .lt('created_at', cutoff)
      .limit(3);
    for (const q of (staleQuotes || [])) {
      await sbUpdate('business_quotes', q.id, { status: 'sent' });
      healed.push({ type: 'quote_sent', id: q.id });
    }
  } catch {}

  // Find sent invoices > 35 days — mark overdue
  try {
    const cutoff35 = new Date(Date.now() - 35 * 86400000).toISOString();
    const { data: overdueInvs } = await supabase
      .from('business_invoices')
      .select('*')
      .eq('status', 'sent')
      .lt('due_date', new Date().toISOString().split('T')[0])
      .limit(5);
    for (const inv of (overdueInvs || [])) {
      await sbUpdate('business_invoices', inv.id, { status: 'overdue' });
      healed.push({ type: 'invoice_overdue_flagged', id: inv.id });
    }
  } catch {}

  return healed;
}

// ── Main cron handler ──────────────────────────────────────────────────────
async function corporateEngine(req, res) {
  // Vercel cron auth check
  if (process.env.NODE_ENV !== 'development') {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && req.headers['x-vercel-cron'] !== '1') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const startMs = Date.now();
  const actions = [];
  const slot = Math.floor(Date.now() / 60000); // minute slot
  const r = prng(slot * 9973 + 11117);

  try {
    // ── MODULE 1: CRM — generate 1 new lead every 5 minutes
    if (slot % 5 === 0) {
      actions.push(await generateLead(r));
    }

    // ── MODULE 2: QUOTES — generate 1 new quote every 10 minutes
    if (slot % 10 === 0) {
      actions.push(await generateQuote(r));
    }

    // ── MODULE 3: SALES CONVERSION — accept a quote every 15 minutes
    if (slot % 15 === 0 && isConfigured && supabase) {
      try {
        const { data: pendingQuotes } = await supabase
          .from('business_quotes')
          .select('*')
          .eq('status', 'sent')
          .order('created_at', { ascending: true })
          .limit(2);
        for (const q of (pendingQuotes || []).slice(0, 1)) {
          actions.push(await convertQuoteToInvoice(q, r));
        }
      } catch {}
    }

    // ── MODULE 4: INVOICING — process a payment every 20 minutes
    if (slot % 20 === 0 && isConfigured && supabase) {
      try {
        const { data: sentInvs } = await supabase
          .from('business_invoices')
          .select('*')
          .in('status', ['sent','overdue'])
          .order('created_at', { ascending: true })
          .limit(2);
        for (const inv of (sentInvs || []).slice(0, 1)) {
          actions.push(await processInvoicePayment(inv));
        }
      } catch {}
    }

    // ── MODULE 5: SUPPORT — generate ticket every 8 minutes
    if (slot % 8 === 0) {
      actions.push(await generateTicket(r));
    }

    // ── MODULE 6: TICKET RESOLUTION — resolve stuck tickets every 12 minutes
    if (slot % 12 === 0) {
      const stuckTickets = await sbGetStuck('support_tickets', 20);
      for (const t of stuckTickets.slice(0, 2)) {
        actions.push(await resolveStuckTicket(t));
      }
    }

    // ── MODULE 7: DEBT REMINDERS — send reminders every 30 minutes
    if (slot % 30 === 0 && isConfigured && supabase) {
      try {
        const { data: pendingDebts } = await supabase
          .from('business_debts')
          .select('*')
          .in('status', ['pending','overdue'])
          .lt('reminders_sent', 3)
          .limit(3);
        for (const d of (pendingDebts || [])) {
          actions.push(await sendDebtReminder(d));
        }
      } catch {}
    }

    // ── MODULE 8: SELF-HEALING — every 45 minutes
    if (slot % 45 === 0) {
      const healed = await healWorkflows();
      actions.push(...healed.map(h => ({ type: 'workflow_healed', data: h })));
    }

    // ── Log engine run to Supabase activity table
    if (isConfigured && supabase && actions.length > 0) {
      try {
        await supabase.from('activity_log').insert({
          id: numId('corp'),
          type: 'corporate_engine_tick',
          module: 'corporate_os',
          message: `Autonomous tick: ${actions.length} actions`,
          data: { actions: actions.map(a => a?.type).filter(Boolean) },
          created_at: ts(),
        }).catch(() => null);
      } catch {}
    }

  } catch (err) {
    console.error('[CorpEngine] Error:', err.message);
  }

  const elapsed = Date.now() - startMs;

  return res.json({
    ok: true,
    slot,
    actions_taken: actions.filter(Boolean).length,
    actions: actions.filter(Boolean).map(a => ({ type: a.type, id: a.data?.id || null })),
    elapsed_ms: elapsed,
    ts: ts(),
    system: {
      crm:       { status: 'active' },
      quotes:    { status: 'active' },
      invoices:  { status: 'active' },
      tickets:   { status: 'active' },
      treasury:  { status: 'active' },
      workflows: { status: 'active' },
    },
    final_state: 'FULLY_AUTONOMOUS',
  });
}

module.exports = corporateEngine;
