'use strict';
const { supabase, isConfigured } = require('../../lib/supabase');

/**
 * Handle CRM API routes backed by Supabase.
 * @param {object} opts - { req, res, path, method, parseBody, json }
 * @returns {boolean} true if route was handled, false otherwise
 */
async function handleCRM({ req, res, path: p, method, parseBody, json }) {

  // ─── GET /api/crm/stats ───
  if (p === '/api/crm/stats' && method === 'GET') {
    if (!isConfigured) return json(res, { total_contacts: 0, customers: 0, leads: 0, prospects: 0, mrr: 0, pipeline_value: 0, avg_deal_value: 0, ts: Date.now() });
    const { data, error } = await supabase.from('crm_stats_view').select('*').limit(1).single();
    if (error) {
      return json(res, { total_contacts: 0, customers: 0, leads: 0, prospects: 0, mrr: 0, pipeline_value: 0, avg_deal_value: 0, ts: Date.now() });
    }
    return json(res, {
      total_contacts: data?.total_contacts || 0,
      customers: data?.customers || 0,
      leads: data?.leads || 0,
      prospects: data?.prospects || 0,
      mrr: +(data?.mrr || 0),
      avg_deal_value: +(data?.avg_deal_value || 0),
      pipeline_value: +(data?.pipeline_value || 0),
      ts: Date.now(),
    });
  }

  // ─── GET /api/crm/contacts ─── list with filters
  if (p === '/api/crm/contacts' && method === 'GET') {
    if (!isConfigured) return json(res, { leads: [], count: 0 });
    const url = new URL(req.url, 'http://localhost');
    const status = url.searchParams.get('status') || '';
    const stage = url.searchParams.get('stage') || '';
    const search = url.searchParams.get('search') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 500);
    const offset = parseInt(url.searchParams.get('offset')) || 0;

    let query = supabase.from('contacts').select('*', { count: 'exact' });
    if (status) query = query.eq('status', status);
    if (stage) query = query.eq('stage', stage);
    if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) return json(res, { error: error.message }, 500);

    const leads = (data || []).map(mapContact);
    return json(res, { leads, count: count || leads.length });
  }

  // ─── POST /api/crm/contacts ─── create
  if (p === '/api/crm/contacts' && method === 'POST') {
    if (!isConfigured) return json(res, { error: 'Supabase not configured' }, 503);
    const body = await parseBody(req);
    const name = body.name || [body.first_name, body.last_name].filter(Boolean).join(' ');
    if (!name && !body.email) return json(res, { error: 'name or email required' }, 400);

    const record = {
      name: name || body.email.split('@')[0],
      email: body.email || null,
      phone: body.phone || null,
      company_name: body.company || body.company_name || null,
      status: body.status || 'lead',
      stage: body.stage || 'new',
      value: body.deal_value || body.value || 0,
      score: body.score || 0,
      source: body.source || 'manual',
      industry: body.industry || null,
      tags: body.tags || [],
      notes: body.notes || null,
      meta: body.meta || {},
    };

    const { data, error } = await supabase.from('contacts').insert(record).select().single();
    if (error) return json(res, { error: error.message }, 500);
    return json(res, { contact: mapContact(data) }, 201);
  }

  // ─── GET /api/crm/contacts/:id ─── single
  const singleMatch = p.match(/^\/api\/crm\/contacts\/([^/]+)$/);
  if (singleMatch && method === 'GET') {
    if (!isConfigured) return json(res, { error: 'Not configured' }, 503);
    const { data, error } = await supabase.from('contacts').select('*').eq('id', singleMatch[1]).single();
    if (error || !data) return json(res, { error: 'Contact not found' }, 404);
    return json(res, { contact: mapContact(data) });
  }

  // ─── PUT /api/crm/contacts/:id ─── update
  if (singleMatch && method === 'PUT') {
    if (!isConfigured) return json(res, { error: 'Not configured' }, 503);
    const body = await parseBody(req);
    const updates = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.first_name !== undefined || body.last_name !== undefined) {
      updates.name = [body.first_name, body.last_name].filter(Boolean).join(' ');
    }
    if (body.email !== undefined) updates.email = body.email;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.company !== undefined) updates.company_name = body.company;
    if (body.company_name !== undefined) updates.company_name = body.company_name;
    if (body.status !== undefined) updates.status = body.status;
    if (body.stage !== undefined) updates.stage = body.stage;
    if (body.value !== undefined) updates.value = body.value;
    if (body.deal_value !== undefined) updates.value = body.deal_value;
    if (body.score !== undefined) updates.score = body.score;
    if (body.source !== undefined) updates.source = body.source;
    if (body.industry !== undefined) updates.industry = body.industry;
    if (body.tags !== undefined) updates.tags = body.tags;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.meta !== undefined) updates.meta = body.meta;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from('contacts').update(updates).eq('id', singleMatch[1]).select().single();
    if (error) return json(res, { error: error.message }, 500);
    return json(res, { contact: mapContact(data) });
  }

  // ─── DELETE /api/crm/contacts/:id ─── soft delete
  if (singleMatch && method === 'DELETE') {
    if (!isConfigured) return json(res, { error: 'Not configured' }, 503);
    const { error } = await supabase.from('contacts').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', singleMatch[1]);
    if (error) return json(res, { error: error.message }, 500);
    return json(res, { ok: true });
  }

  // ─── GET /api/crm/leads ─── contacts where status != 'customer'
  if (p === '/api/crm/leads' && method === 'GET') {
    if (!isConfigured) return json(res, { leads: [], count: 0 });
    const url = new URL(req.url, 'http://localhost');
    const search = url.searchParams.get('search') || '';
    const stage = url.searchParams.get('stage') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 500);
    const offset = parseInt(url.searchParams.get('offset')) || 0;

    let query = supabase.from('contacts').select('*', { count: 'exact' }).neq('status', 'customer');
    if (stage) query = query.eq('stage', stage);
    if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) return json(res, { error: error.message }, 500);

    const leads = (data || []).map(mapContact);
    return json(res, { leads, count: count || leads.length });
  }

  // ─── POST /api/crm/leads ─── alias for POST /api/crm/contacts
  if (p === '/api/crm/leads' && method === 'POST') {
    if (!isConfigured) return json(res, { error: 'Supabase not configured' }, 503);
    const body = await parseBody(req);
    const name = body.name || [body.first_name, body.last_name].filter(Boolean).join(' ');
    if (!name && !body.email) return json(res, { error: 'name or email required' }, 400);

    const record = {
      name: name || body.email.split('@')[0],
      email: body.email || null,
      phone: body.phone || null,
      company_name: body.company || body.company_name || null,
      status: body.status || 'lead',
      stage: body.stage || 'new',
      value: body.deal_value || body.value || 0,
      score: body.score || 0,
      source: body.source || 'manual',
      industry: body.industry || null,
      tags: body.tags || [],
      notes: body.notes || null,
      meta: body.meta || {},
    };

    const { data, error } = await supabase.from('contacts').insert(record).select().single();
    if (error) return json(res, { error: error.message }, 500);
    return json(res, { contact: mapContact(data) }, 201);
  }

  // ─── PUT /api/crm/leads/:id/stage ─── update stage
  const stageMatch = p.match(/^\/api\/crm\/leads\/([^/]+)\/stage$/);
  if (stageMatch && method === 'PUT') {
    if (!isConfigured) return json(res, { error: 'Not configured' }, 503);
    const body = await parseBody(req);
    const updates = { updated_at: new Date().toISOString() };
    if (body.stage) updates.stage = body.stage;
    if (body.status) updates.status = body.status;

    // Append note to meta if provided
    let metaUpdate = null;
    if (body.note) {
      const { data: existing } = await supabase.from('contacts').select('meta').eq('id', stageMatch[1]).single();
      const meta = existing?.meta || {};
      if (!meta.notes_log) meta.notes_log = [];
      meta.notes_log.push({ text: body.note, ts: new Date().toISOString() });
      metaUpdate = meta;
    }
    if (metaUpdate) updates.meta = metaUpdate;

    const { data, error } = await supabase.from('contacts').update(updates).eq('id', stageMatch[1]).select().single();
    if (error) return json(res, { error: error.message }, 500);
    return json(res, { contact: mapContact(data) });
  }

  // ─── POST /api/crm/leads/:id/notes ─── add note
  const notesMatch = p.match(/^\/api\/crm\/leads\/([^/]+)\/notes$/);
  if (notesMatch && method === 'POST') {
    if (!isConfigured) return json(res, { error: 'Not configured' }, 503);
    const body = await parseBody(req);
    if (!body.text) return json(res, { error: 'text required' }, 400);

    const { data: existing } = await supabase.from('contacts').select('meta').eq('id', notesMatch[1]).single();
    const meta = existing?.meta || {};
    if (!meta.notes_log) meta.notes_log = [];
    meta.notes_log.push({ text: body.text, ts: new Date().toISOString() });

    const { data, error } = await supabase.from('contacts').update({ meta, updated_at: new Date().toISOString() }).eq('id', notesMatch[1]).select().single();
    if (error) return json(res, { error: error.message }, 500);
    return json(res, { contact: mapContact(data) });
  }

  // ─── GET /api/crm/campaigns ─── mock data for now
  if (p === '/api/crm/campaigns' && method === 'GET') {
    return json(res, {
      campaigns: [
        { id: 'c1', name: 'Q2 Outreach', type: 'email', status: 'active', sent: 142, opened: 89, replied: 23, started_at: '2026-04-01' },
        { id: 'c2', name: 'Product Launch', type: 'multi-channel', status: 'draft', sent: 0, opened: 0, replied: 0, started_at: null },
        { id: 'c3', name: 'Re-engagement', type: 'email', status: 'completed', sent: 310, opened: 198, replied: 45, started_at: '2026-03-15' },
      ],
      count: 3,
    });
  }

  return false; // not handled
}

/**
 * Map a raw contacts row to the API response shape
 */
function mapContact(row) {
  if (!row) return null;
  const parts = (row.name || '').split(' ');
  const first_name = parts[0] || '';
  const last_name = parts.slice(1).join(' ') || '';
  return {
    id: row.id,
    email: row.email,
    first_name,
    last_name,
    company: row.company_name || '',
    status: row.status || 'lead',
    stage: row.stage || 'new',
    score: row.score || 0,
    deal_value: +(row.value || 0),
    phone: row.phone || '',
    source: row.source || '',
    industry: row.industry || '',
    tags: row.tags || [],
    notes: row.notes || '',
    activity: (row.meta?.notes_log) || [],
    meta: row.meta || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

module.exports = { handleCRM };
