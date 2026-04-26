/**
 * BRIDGE AI OS — Business Suite Service Layer
 *
 * Centralized CRUD operations for all business modules against Supabase.
 * Every mutation logs to activity_log and emits orchestration events.
 *
 * Usage:  const biz = require('./business-suite');
 *         const invoices = await biz.invoices.list(companyId, { status: 'sent' });
 */

'use strict';

const { supabase, isConfigured } = require('./supabase');

// Default company ID (Bridge AI OS seed)
const DEFAULT_COMPANY = '00000000-0000-0000-0000-000000000001';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function logActivity(companyId, module, action, entityType, entityId, description, meta = {}) {
  if (!isConfigured) return;
  try {
    await supabase.from('activity_log').insert({
      company_id: companyId, module, action, entity_type: entityType,
      entity_id: entityId, description, meta,
    });
  } catch (e) { console.warn('[BIZ] Activity log failed:', e.message); }
}

async function emitEvent(companyId, eventType, source, entityType, entityId, payload = {}) {
  if (!isConfigured) return;
  try {
    await supabase.from('orchestration_events').insert({
      company_id: companyId, event_type: eventType, source,
      entity_type: entityType, entity_id: entityId, payload,
    });
  } catch (e) { console.warn('[BIZ] Event emission failed:', e.message); }
}

function ok(data) { return { ok: true, ...data }; }
function fail(msg, status = 400) { return { ok: false, error: msg, status }; }

// ── Generic CRUD builder ─────────────────────────────────────────────────────

function buildCRUD(table, module, entityType) {
  return {
    async list(companyId, filters = {}, { limit = 100, offset = 0, orderBy = 'created_at', order = 'desc' } = {}) {
      if (!isConfigured) return fail('Database not configured', 503);
      let q = supabase.from(table).select('*').eq('company_id', companyId || DEFAULT_COMPANY);
      for (const [k, v] of Object.entries(filters)) {
        if (v !== undefined && v !== null && v !== '') q = q.eq(k, v);
      }
      q = q.order(orderBy, { ascending: order === 'asc' }).range(offset, offset + limit - 1);
      const { data, error, count } = await q;
      if (error) return fail(error.message, 500);
      return ok({ [table]: data || [], count: (data || []).length });
    },

    async get(id) {
      if (!isConfigured) return fail('Database not configured', 503);
      const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
      if (error) return fail(error.message, error.code === 'PGRST116' ? 404 : 500);
      return ok({ [entityType]: data });
    },

    async create(companyId, payload) {
      if (!isConfigured) return fail('Database not configured', 503);
      const row = { ...payload, company_id: companyId || DEFAULT_COMPANY };
      const { data, error } = await supabase.from(table).insert(row).select().single();
      if (error) return fail(error.message, 500);
      await logActivity(row.company_id, module, 'created', entityType, data.id, `${entityType} created`);
      return ok({ [entityType]: data, created: true });
    },

    async update(id, updates) {
      if (!isConfigured) return fail('Database not configured', 503);
      const { data, error } = await supabase.from(table).update(updates).eq('id', id).select().single();
      if (error) return fail(error.message, 500);
      await logActivity(data.company_id, module, 'updated', entityType, id, `${entityType} updated`, updates);
      return ok({ [entityType]: data, updated: true });
    },

    async delete(id) {
      if (!isConfigured) return fail('Database not configured', 503);
      const { data, error } = await supabase.from(table).delete().eq('id', id).select().single();
      if (error) return fail(error.message, 500);
      await logActivity(data?.company_id, module, 'deleted', entityType, id, `${entityType} deleted`);
      return ok({ deleted: true, id });
    },

    async stats(companyId) {
      if (!isConfigured) return fail('Database not configured', 503);
      const { data, error } = await supabase.from(table).select('*').eq('company_id', companyId || DEFAULT_COMPANY);
      if (error) return fail(error.message, 500);
      return ok({ total: (data || []).length, data: data || [] });
    },
  };
}

// ============================================================================
// MODULE-SPECIFIC SERVICES
// ============================================================================

// ── Companies ────────────────────────────────────────────────────────────────
const companies = {
  ...buildCRUD('companies', 'settings', 'company'),

  async getBySlug(slug) {
    if (!isConfigured) return fail('Database not configured', 503);
    const { data, error } = await supabase.from('companies').select('*').eq('slug', slug).single();
    if (error) return fail('Company not found', 404);
    return ok({ company: data });
  },

  async updateBranding(companyId, branding) {
    const { data, error } = await supabase
      .from('companies').update({ branding }).eq('id', companyId).select().single();
    if (error) return fail(error.message, 500);
    return ok({ company: data });
  },

  async getDefault() {
    return this.get(DEFAULT_COMPANY);
  },
};

// ── Contacts (CRM) ──────────────────────────────────────────────────────────
const contacts = {
  ...buildCRUD('contacts', 'crm', 'contact'),

  async listByStatus(companyId, status) {
    return this.list(companyId, { status });
  },

  async getCustomers(companyId) {
    return this.list(companyId, { status: 'customer' });
  },

  async getLeads(companyId) {
    if (!isConfigured) return fail('Database not configured', 503);
    const { data, error } = await supabase.from('contacts').select('*')
      .eq('company_id', companyId || DEFAULT_COMPANY)
      .in('status', ['lead', 'prospect', 'qualified'])
      .order('created_at', { ascending: false });
    if (error) return fail(error.message, 500);
    return ok({ contacts: data || [], count: (data || []).length });
  },

  async crmStats(companyId) {
    if (!isConfigured) return fail('Database not configured', 503);
    const cid = companyId || DEFAULT_COMPANY;
    const { data, error } = await supabase.from('contacts').select('*').eq('company_id', cid);
    if (error) return fail(error.message, 500);
    const all = data || [];
    const customers = all.filter(c => c.status === 'customer');
    const leads = all.filter(c => ['lead', 'prospect', 'qualified'].includes(c.status));
    const mrr = customers.reduce((s, c) => s + (parseFloat(c.value) || 0), 0);
    const pipeline = all.reduce((s, c) => s + (parseFloat(c.value) || 0), 0);
    return ok({
      total: all.length,
      customers: customers.length,
      leads: leads.length,
      prospects: all.filter(c => c.status === 'prospect').length,
      mrr: +mrr.toFixed(2),
      total_pipeline_value: +pipeline.toFixed(2),
      by_stage: {
        new: all.filter(c => c.stage === 'new').length,
        outreach: all.filter(c => c.stage === 'outreach').length,
        demo: all.filter(c => c.stage === 'demo').length,
        proposal: all.filter(c => c.stage === 'proposal').length,
        negotiation: all.filter(c => c.stage === 'negotiation').length,
        closed: all.filter(c => c.stage === 'closed').length,
        lost: all.filter(c => c.stage === 'lost').length,
      },
    });
  },

  async updateStage(id, stage) {
    const result = await this.update(id, { stage, last_activity: new Date().toISOString() });
    if (result.ok && stage === 'closed') {
      await this.update(id, { status: 'customer' });
      await emitEvent(result.contact?.company_id, 'deal.closed', 'crm', 'contact', id, { stage });
    }
    return result;
  },
};

// ── Invoices ─────────────────────────────────────────────────────────────────
const invoices = {
  ...buildCRUD('invoices', 'invoicing', 'invoice'),

  async create(companyId, payload) {
    if (!isConfigured) return fail('Database not configured', 503);
    const cid = companyId || DEFAULT_COMPANY;

    // Auto-generate invoice number
    let invoiceNumber = payload.invoice_number;
    if (!invoiceNumber) {
      const { data: numData } = await supabase.rpc('next_invoice_number', { p_company_id: cid });
      invoiceNumber = numData || `INV-${Date.now()}`;
    }

    // Calculate totals
    const items = payload.line_items || [];
    const subtotal = items.reduce((s, i) => s + ((i.qty || 1) * (i.unit_price || 0)), 0);
    const taxRate = payload.tax_rate ?? 15;
    const taxAmount = +(subtotal * taxRate / 100).toFixed(2);
    const discount = parseFloat(payload.discount) || 0;
    const total = +(subtotal + taxAmount - discount).toFixed(2);

    const row = {
      company_id: cid,
      invoice_number: invoiceNumber,
      client_name: payload.client_name || payload.client || 'Unknown',
      client_email: payload.client_email || payload.email || '',
      line_items: items,
      subtotal, tax_rate: taxRate, tax_amount: taxAmount, discount, total,
      currency: payload.currency || 'ZAR',
      status: payload.status || 'draft',
      issued_date: payload.issued_date || new Date().toISOString().slice(0, 10),
      due_date: payload.due_date || null,
      notes: payload.notes || '',
      contact_id: payload.contact_id || null,
      created_by: payload.created_by || 'manual',
    };

    const { data, error } = await supabase.from('invoices').insert(row).select().single();
    if (error) return fail(error.message, 500);
    await logActivity(cid, 'invoicing', 'created', 'invoice', data.id, `Invoice ${invoiceNumber} created`);
    await emitEvent(cid, 'invoice.created', 'invoicing', 'invoice', data.id, { total, client: row.client_name });
    return ok({ invoice: data, created: true });
  },

  async send(id) {
    const result = await this.update(id, { status: 'sent' });
    if (result.ok) {
      await emitEvent(result.invoice?.company_id, 'invoice.sent', 'invoicing', 'invoice', id, {
        client_email: result.invoice?.client_email, total: result.invoice?.total,
      });
    }
    return result;
  },

  async markPaid(id, paymentId = null) {
    const result = await this.update(id, { status: 'paid', paid_date: new Date().toISOString().slice(0, 10), payment_id: paymentId });
    if (result.ok) {
      await emitEvent(result.invoice?.company_id, 'invoice.paid', 'invoicing', 'invoice', id, {
        total: result.invoice?.total, client: result.invoice?.client_name,
      });
    }
    return result;
  },

  async invoiceStats(companyId) {
    if (!isConfigured) return fail('Database not configured', 503);
    const cid = companyId || DEFAULT_COMPANY;
    const { data, error } = await supabase.from('invoices').select('*').eq('company_id', cid);
    if (error) return fail(error.message, 500);
    const all = data || [];
    const paid = all.filter(i => i.status === 'paid');
    const sent = all.filter(i => i.status === 'sent');
    const overdue = all.filter(i => i.status === 'sent' && i.due_date && new Date(i.due_date) < new Date());
    return ok({
      total: all.length,
      paid: paid.length,
      sent: sent.length,
      draft: all.filter(i => i.status === 'draft').length,
      overdue: overdue.length,
      paid_total: +paid.reduce((s, i) => s + parseFloat(i.total || 0), 0).toFixed(2),
      outstanding_total: +sent.reduce((s, i) => s + parseFloat(i.total || 0), 0).toFixed(2),
      revenue: +paid.reduce((s, i) => s + parseFloat(i.total || 0), 0).toFixed(2),
    });
  },

  async convertFromQuote(quoteId, companyId) {
    // Get the quote
    const quoteResult = await quotes.get(quoteId);
    if (!quoteResult.ok) return quoteResult;
    const q = quoteResult.quote;

    // Create invoice from quote data
    const invResult = await this.create(companyId || q.company_id, {
      client_name: q.client_name,
      client_email: q.client_email,
      line_items: q.line_items,
      tax_rate: q.tax_rate,
      discount: q.discount,
      currency: q.currency,
      notes: `Converted from quote ${q.quote_number}`,
      contact_id: q.contact_id,
      created_by: 'quote_conversion',
    });

    if (invResult.ok) {
      await quotes.update(quoteId, { status: 'converted', converted_invoice_id: invResult.invoice.id });
    }
    return invResult;
  },
};

// ── Quotes ───────────────────────────────────────────────────────────────────
const quotes = {
  ...buildCRUD('quotes', 'quotes', 'quote'),

  async create(companyId, payload) {
    if (!isConfigured) return fail('Database not configured', 503);
    const cid = companyId || DEFAULT_COMPANY;

    let quoteNumber = payload.quote_number;
    if (!quoteNumber) {
      const { data: numData } = await supabase.rpc('next_quote_number', { p_company_id: cid });
      quoteNumber = numData || `QUO-${Date.now()}`;
    }

    const items = payload.line_items || [];
    const subtotal = items.reduce((s, i) => s + ((i.qty || 1) * (i.unit_price || 0)), 0);
    const taxRate = payload.tax_rate ?? 15;
    const taxAmount = +(subtotal * taxRate / 100).toFixed(2);
    const discount = parseFloat(payload.discount) || 0;
    const total = +(subtotal + taxAmount - discount).toFixed(2);

    const row = {
      company_id: cid, quote_number: quoteNumber,
      client_name: payload.client_name || 'Unknown',
      client_email: payload.client_email || '',
      line_items: items, subtotal, tax_rate: taxRate, tax_amount: taxAmount, discount, total,
      currency: payload.currency || 'ZAR',
      status: payload.status || 'draft',
      valid_until: payload.valid_until || null,
      notes: payload.notes || '',
      contact_id: payload.contact_id || null,
      created_by: payload.created_by || 'manual',
    };

    const { data, error } = await supabase.from('quotes').insert(row).select().single();
    if (error) return fail(error.message, 500);
    await logActivity(cid, 'quotes', 'created', 'quote', data.id, `Quote ${quoteNumber} created`);
    return ok({ quote: data, created: true });
  },

  async accept(id) {
    const result = await this.update(id, { status: 'accepted' });
    if (result.ok) {
      await emitEvent(result.quote?.company_id, 'quote.accepted', 'quotes', 'quote', id, {
        total: result.quote?.total, client: result.quote?.client_name,
      });
    }
    return result;
  },

  async quoteStats(companyId) {
    if (!isConfigured) return fail('Database not configured', 503);
    const { data, error } = await supabase.from('quotes').select('*').eq('company_id', companyId || DEFAULT_COMPANY);
    if (error) return fail(error.message, 500);
    const all = data || [];
    const accepted = all.filter(q => q.status === 'accepted');
    return ok({
      total: all.length,
      draft: all.filter(q => q.status === 'draft').length,
      sent: all.filter(q => q.status === 'sent').length,
      accepted: accepted.length,
      rejected: all.filter(q => q.status === 'rejected').length,
      acceptance_rate: all.length > 0 ? +((accepted.length / all.length) * 100).toFixed(1) : 0,
      total_value: +all.reduce((s, q) => s + parseFloat(q.total || 0), 0).toFixed(2),
    });
  },
};

// ── Tickets ──────────────────────────────────────────────────────────────────
const tickets = {
  ...buildCRUD('tickets', 'tickets', 'ticket'),

  async create(companyId, payload) {
    if (!isConfigured) return fail('Database not configured', 503);
    const cid = companyId || DEFAULT_COMPANY;
    const row = {
      company_id: cid, subject: payload.subject, body: payload.body || '',
      priority: payload.priority || 'medium', status: 'open',
      client_name: payload.client_name || payload.client || '',
      client_email: payload.client_email || payload.email || '',
      assigned_to: payload.assigned_to || null,
      contact_id: payload.contact_id || null,
    };
    const { data, error } = await supabase.from('tickets').insert(row).select().single();
    if (error) return fail(error.message, 500);
    await logActivity(cid, 'tickets', 'created', 'ticket', data.id, `Ticket: ${payload.subject}`);
    await emitEvent(cid, 'ticket.created', 'tickets', 'ticket', data.id, { priority: row.priority, subject: row.subject });
    return ok({ ticket: data, created: true });
  },

  async addReply(id, message, author = 'system') {
    if (!isConfigured) return fail('Database not configured', 503);
    const { data: existing } = await supabase.from('tickets').select('replies, company_id').eq('id', id).single();
    if (!existing) return fail('Ticket not found', 404);
    const replies = [...(existing.replies || []), { author, message, created_at: new Date().toISOString() }];
    const { data, error } = await supabase.from('tickets').update({ replies }).eq('id', id).select().single();
    if (error) return fail(error.message, 500);
    return ok({ ticket: data, reply_added: true });
  },

  async resolve(id) {
    return this.update(id, { status: 'resolved', resolved_at: new Date().toISOString() });
  },

  async ticketStats(companyId) {
    if (!isConfigured) return fail('Database not configured', 503);
    const { data, error } = await supabase.from('tickets').select('*').eq('company_id', companyId || DEFAULT_COMPANY);
    if (error) return fail(error.message, 500);
    const all = data || [];
    return ok({
      total: all.length,
      open: all.filter(t => t.status === 'open').length,
      in_progress: all.filter(t => t.status === 'in_progress').length,
      resolved: all.filter(t => t.status === 'resolved').length,
      closed: all.filter(t => t.status === 'closed').length,
    });
  },
};

// ── Vendors ──────────────────────────────────────────────────────────────────
const vendors = {
  ...buildCRUD('vendors', 'vendors', 'vendor'),

  async getWithInventory(companyId) {
    if (!isConfigured) return fail('Database not configured', 503);
    const cid = companyId || DEFAULT_COMPANY;
    const [vendorRes, invRes] = await Promise.all([
      supabase.from('vendors').select('*').eq('company_id', cid).order('name'),
      supabase.from('inventory').select('*').eq('company_id', cid).order('item_name'),
    ]);
    return ok({
      vendors: vendorRes.data || [],
      inventory: invRes.data || [],
    });
  },
};

// ── Inventory ────────────────────────────────────────────────────────────────
const inventoryService = buildCRUD('inventory', 'vendors', 'inventory_item');

// ── Debts ────────────────────────────────────────────────────────────────────
const debts = buildCRUD('debts', 'vendors', 'debt');

// ── Workforce ────────────────────────────────────────────────────────────────
const workforce = {
  ...buildCRUD('workforce', 'workforce', 'worker'),

  async getByDepartment(companyId) {
    if (!isConfigured) return fail('Database not configured', 503);
    const { data, error } = await supabase.from('workforce').select('*')
      .eq('company_id', companyId || DEFAULT_COMPANY).order('department');
    if (error) return fail(error.message, 500);
    const all = data || [];
    const departments = {};
    for (const w of all) {
      const dept = w.department || 'Unassigned';
      if (!departments[dept]) departments[dept] = [];
      departments[dept].push(w);
    }
    return ok({ workforce: all, departments, total: all.length });
  },
};

// ── Campaigns (Marketing) ────────────────────────────────────────────────────
const campaigns = {
  ...buildCRUD('campaigns', 'marketing', 'campaign'),

  async marketingStats(companyId) {
    if (!isConfigured) return fail('Database not configured', 503);
    const { data, error } = await supabase.from('campaigns').select('*').eq('company_id', companyId || DEFAULT_COMPANY);
    if (error) return fail(error.message, 500);
    const all = data || [];
    return ok({
      total_campaigns: all.length,
      active: all.filter(c => c.status === 'active').length,
      total_leads: all.reduce((s, c) => s + (c.leads_generated || 0), 0),
      total_conversions: all.reduce((s, c) => s + (c.conversions || 0), 0),
      avg_open_rate: all.length > 0 ? +(all.reduce((s, c) => s + (c.open_rate || 0), 0) / all.length).toFixed(1) : 0,
      avg_click_rate: all.length > 0 ? +(all.reduce((s, c) => s + (c.click_rate || 0), 0) / all.length).toFixed(1) : 0,
    });
  },
};

// ── Affiliates ───────────────────────────────────────────────────────────────
const affiliatesService = {
  ...buildCRUD('affiliates', 'affiliate', 'affiliate'),

  async getLeaderboard(companyId) {
    if (!isConfigured) return fail('Database not configured', 503);
    const { data, error } = await supabase.from('affiliates').select('*')
      .eq('company_id', companyId || DEFAULT_COMPANY)
      .order('revenue', { ascending: false });
    if (error) return fail(error.message, 500);
    return ok({ leaderboard: data || [] });
  },

  async affiliateStats(companyId) {
    if (!isConfigured) return fail('Database not configured', 503);
    const { data, error } = await supabase.from('affiliates').select('*').eq('company_id', companyId || DEFAULT_COMPANY);
    if (error) return fail(error.message, 500);
    const all = data || [];
    return ok({
      total_affiliates: all.length,
      total_clicks: all.reduce((s, a) => s + (a.clicks || 0), 0),
      total_signups: all.reduce((s, a) => s + (a.signups || 0), 0),
      total_revenue: +all.reduce((s, a) => s + parseFloat(a.revenue || 0), 0).toFixed(2),
      total_earned: +all.reduce((s, a) => s + parseFloat(a.earned || 0), 0).toFixed(2),
      avg_conversion: all.length > 0
        ? +((all.reduce((s, a) => s + (a.clicks > 0 ? a.signups / a.clicks : 0), 0) / all.length) * 100).toFixed(1)
        : 0,
    });
  },
};

// ── Proposals (Governance) ───────────────────────────────────────────────────
const proposals = {
  ...buildCRUD('proposals', 'governance', 'proposal'),

  async vote(id, direction) {
    if (!isConfigured) return fail('Database not configured', 503);
    const { data: existing } = await supabase.from('proposals').select('*').eq('id', id).single();
    if (!existing) return fail('Proposal not found', 404);
    const field = direction === 'for' ? 'votes_for' : 'votes_against';
    const update = { [field]: (existing[field] || 0) + 1 };
    const { data, error } = await supabase.from('proposals').update(update).eq('id', id).select().single();
    if (error) return fail(error.message, 500);
    return ok({ proposal: data, voted: direction });
  },
};

// ── Legal Documents ──────────────────────────────────────────────────────────
const legalDocs = buildCRUD('legal_documents', 'legal', 'document');

// ── Compliance ───────────────────────────────────────────────────────────────
const compliance = {
  ...buildCRUD('compliance_status', 'legal', 'compliance'),

  async getFrameworks(companyId) {
    if (!isConfigured) return fail('Database not configured', 503);
    const { data, error } = await supabase.from('compliance_status').select('*')
      .eq('company_id', companyId || DEFAULT_COMPANY).order('framework');
    if (error) return fail(error.message, 500);
    return ok({ frameworks: data || [] });
  },
};

// ── Payment Configs ──────────────────────────────────────────────────────────
const paymentConfigs = {
  ...buildCRUD('payment_configs', 'settings', 'payment_config'),

  async getDefault(companyId) {
    if (!isConfigured) return fail('Database not configured', 503);
    const { data, error } = await supabase.from('payment_configs').select('*')
      .eq('company_id', companyId || DEFAULT_COMPANY).eq('is_default', true).single();
    if (error) return fail('No default payment config', 404);
    return ok({ payment_config: data });
  },

  async setDefault(companyId, provider) {
    if (!isConfigured) return fail('Database not configured', 503);
    const cid = companyId || DEFAULT_COMPANY;
    // Unset current default
    await supabase.from('payment_configs').update({ is_default: false }).eq('company_id', cid);
    // Set new default
    const { data, error } = await supabase.from('payment_configs')
      .update({ is_default: true }).eq('company_id', cid).eq('provider', provider).select().single();
    if (error) return fail(error.message, 500);
    // Also update company record
    await supabase.from('companies').update({ payment_provider: provider }).eq('id', cid);
    return ok({ payment_config: data });
  },
};

// ── CSV Import/Export ────────────────────────────────────────────────────────
const csv = {
  exportToCSV(data, fields) {
    if (!data || data.length === 0) return '';
    const headers = fields || Object.keys(data[0]);
    const rows = data.map(row =>
      headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  },

  parseCSV(csvString) {
    const lines = csvString.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
      const values = [];
      let current = '';
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes; }
        else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
        else { current += char; }
      }
      values.push(current.trim());
      const obj = {};
      headers.forEach((h, i) => { obj[h] = values[i] || ''; });
      return obj;
    });
  },

  async importEntities(companyId, table, csvString, fieldMap = {}) {
    const rows = this.parseCSV(csvString);
    if (rows.length === 0) return fail('No data found in CSV');
    const mapped = rows.map(row => {
      const entity = { company_id: companyId || DEFAULT_COMPANY };
      for (const [csvField, dbField] of Object.entries(fieldMap)) {
        if (row[csvField] !== undefined) entity[dbField] = row[csvField];
      }
      // Also map any direct matches
      for (const [k, v] of Object.entries(row)) {
        if (!entity[k] && v) entity[k] = v;
      }
      return entity;
    });
    const { data, error } = await supabase.from(table).insert(mapped).select();
    if (error) return fail(error.message, 500);
    return ok({ imported: (data || []).length, entities: data });
  },
};

// ── Activity Log ─────────────────────────────────────────────────────────────
const activityLog = {
  async list(companyId, { module, limit = 50 } = {}) {
    if (!isConfigured) return fail('Database not configured', 503);
    let q = supabase.from('activity_log').select('*')
      .eq('company_id', companyId || DEFAULT_COMPANY)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (module) q = q.eq('module', module);
    const { data, error } = await q;
    if (error) return fail(error.message, 500);
    return ok({ activities: data || [] });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  companies,
  contacts,
  invoices,
  quotes,
  tickets,
  vendors,
  inventory: inventoryService,
  debts,
  workforce,
  campaigns,
  affiliates: affiliatesService,
  proposals,
  legalDocs,
  compliance,
  paymentConfigs,
  csv,
  activityLog,
  DEFAULT_COMPANY,
  // Helpers for direct use
  logActivity,
  emitEvent,
};
