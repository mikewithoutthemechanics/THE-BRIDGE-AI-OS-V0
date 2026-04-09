'use strict';

/**
 * notion-sync.js — Notion reporting layer backed by Supabase
 *
 * Creates and syncs data to Notion databases:
 *   1. CRM Leads — mirrors crm_leads table
 *   2. Secrets Vault — mirrors secrets_vault (names only, not values)
 *   3. Campaigns — mirrors crm_campaigns
 *   4. Analytics — aggregated stats dashboard
 *
 * Usage:
 *   const notionSync = require('./lib/notion-sync');
 *   await notionSync.init();          // Creates databases if missing
 *   await notionSync.syncLeads();     // Push new leads to Notion
 *   await notionSync.syncStats();     // Push analytics snapshot
 */

const secrets = require('./secrets');
const { supabase } = require('./supabase');

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

function getToken() {
  return secrets.getSecret('NOTION_TOKEN') || process.env.NOTION_TOKEN;
}

function getParentPageId() {
  return secrets.getSecret('NOTION_PARENT_PAGE') || process.env.NOTION_PARENT_PAGE;
}

async function notionFetch(endpoint, method = 'GET', body = null) {
  const token = getToken();
  if (!token) throw new Error('NOTION_TOKEN not set');

  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${NOTION_API}${endpoint}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API ${res.status}: ${text}`);
  }
  return res.json();
}

// ===== DATABASE SCHEMAS =====

const DB_SCHEMAS = {
  crm_leads: {
    title: [{ text: { content: 'CRM Leads — BridgeAI' } }],
    properties: {
      'Email':        { email: {} },
      'Company':      { rich_text: {} },
      'Status':       { select: { options: [
        { name: 'prospect', color: 'gray' },
        { name: 'qualified', color: 'blue' },
        { name: 'deal', color: 'yellow' },
        { name: 'won', color: 'green' },
        { name: 'lost', color: 'red' }
      ]}},
      'Score':        { number: {} },
      'Source':       { select: { options: [
        { name: 'scraper', color: 'purple' },
        { name: 'manual', color: 'blue' },
        { name: 'referral', color: 'green' }
      ]}},
      'Industry':     { rich_text: {} },
      'Template':     { rich_text: {} },
      'Created':      { date: {} },
      'Name':         { title: {} }
    }
  },

  secrets_vault: {
    title: [{ text: { content: 'Secrets Vault — BridgeAI' } }],
    properties: {
      'Key Name':     { title: {} },
      'Service':      { select: { options: [
        { name: 'API', color: 'blue' },
        { name: 'SMTP', color: 'green' },
        { name: 'ENV', color: 'gray' },
        { name: 'Payment', color: 'yellow' }
      ]}},
      'Status':       { select: { options: [
        { name: 'active', color: 'green' },
        { name: 'rotating', color: 'yellow' },
        { name: 'revoked', color: 'red' }
      ]}},
      'Updated By':   { rich_text: {} },
      'Last Updated': { date: {} }
    }
  },

  campaigns: {
    title: [{ text: { content: 'Campaigns — BridgeAI' } }],
    properties: {
      'Name':         { title: {} },
      'Template':     { select: { options: [
        { name: 'executive', color: 'purple' },
        { name: 'tech_founder', color: 'blue' },
        { name: 'marketing_pro', color: 'green' },
        { name: 'founder', color: 'yellow' },
        { name: 'standard', color: 'gray' },
        { name: 'general', color: 'default' }
      ]}},
      'Status':       { select: { options: [
        { name: 'draft', color: 'gray' },
        { name: 'active', color: 'green' },
        { name: 'paused', color: 'yellow' },
        { name: 'completed', color: 'blue' }
      ]}},
      'Target Count': { number: {} },
      'Sent Count':   { number: {} },
      'Created':      { date: {} }
    }
  }
};

// ===== DATABASE CREATION =====

async function getOrCreateDatabase(schemaKey) {
  const dbIdKey = `NOTION_DB_${schemaKey.toUpperCase()}`;
  const existingId = secrets.getSecret(dbIdKey);

  if (existingId) {
    try {
      await notionFetch(`/databases/${existingId}`);
      return existingId;
    } catch (_) {
      // Database was deleted, recreate
    }
  }

  const parentPageId = getParentPageId();
  if (!parentPageId) throw new Error('NOTION_PARENT_PAGE not set — create a Notion page and set its ID');

  const schema = DB_SCHEMAS[schemaKey];
  const result = await notionFetch('/databases', 'POST', {
    parent: { type: 'page_id', page_id: parentPageId },
    title: schema.title,
    properties: schema.properties
  });

  // Persist the DB ID
  await secrets.setSecret(dbIdKey, result.id, 'Notion', 'notion-sync');
  console.log(`[notion-sync] Created database "${schemaKey}": ${result.id}`);
  return result.id;
}

async function init() {
  const token = getToken();
  if (!token) {
    console.log('[notion-sync] NOTION_TOKEN not set — skipping Notion sync init');
    return false;
  }

  try {
    for (const key of Object.keys(DB_SCHEMAS)) {
      await getOrCreateDatabase(key);
    }
    console.log('[notion-sync] All databases initialized');
    return true;
  } catch (err) {
    console.error(`[notion-sync] Init failed: ${err.message}`);
    return false;
  }
}

// ===== SYNC FUNCTIONS =====

async function syncLeads(limit = 50) {
  if (!supabase) return { synced: 0, error: 'Supabase not configured' };
  const dbId = secrets.getSecret('NOTION_DB_CRM_LEADS');
  if (!dbId) return { synced: 0, error: 'database not initialized' };

  // Get unsynced leads (left join via two queries)
  const { data: syncedIds } = await supabase
    .from('notion_sync_log')
    .select('record_id')
    .eq('table_name', 'crm_leads');
  const alreadySynced = new Set((syncedIds || []).map(r => r.record_id));

  const { data: allLeads } = await supabase
    .from('crm_leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  const leads = (allLeads || []).filter(l => !alreadySynced.has(l.id));

  let synced = 0;
  for (const lead of leads) {
    try {
      const page = await notionFetch('/pages', 'POST', {
        parent: { database_id: dbId },
        properties: {
          'Name':    { title: [{ text: { content: lead.company || lead.email } }] },
          'Email':   { email: lead.email },
          'Company': { rich_text: [{ text: { content: lead.company || '' } }] },
          'Status':  { select: { name: lead.status || 'prospect' } },
          'Score':   { number: lead.score || 0 },
          'Source':  { select: { name: lead.source || 'scraper' } },
          'Created': { date: { start: lead.created_at || new Date().toISOString() } }
        }
      });

      await supabase.from('notion_sync_log').upsert({
        table_name: 'crm_leads',
        record_id: lead.id,
        notion_page_id: page.id,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'table_name,record_id' });
      synced++;
    } catch (err) {
      console.error(`[notion-sync] Failed to sync lead ${lead.id}: ${err.message}`);
    }
  }

  return { synced, total: leads.length };
}

async function syncCampaigns() {
  if (!supabase) return { synced: 0, error: 'Supabase not configured' };
  const dbId = secrets.getSecret('NOTION_DB_CAMPAIGNS');
  if (!dbId) return { synced: 0, error: 'database not initialized' };

  const { data: syncedIds } = await supabase
    .from('notion_sync_log')
    .select('record_id')
    .eq('table_name', 'crm_campaigns');
  const alreadySynced = new Set((syncedIds || []).map(r => r.record_id));

  const { data: allCampaigns } = await supabase
    .from('crm_campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  const campaigns = (allCampaigns || []).filter(c => !alreadySynced.has(c.id));

  let synced = 0;
  for (const camp of campaigns) {
    try {
      const page = await notionFetch('/pages', 'POST', {
        parent: { database_id: dbId },
        properties: {
          'Name':         { title: [{ text: { content: camp.name } }] },
          'Template':     { select: { name: camp.template_type || 'general' } },
          'Status':       { select: { name: camp.status || 'draft' } },
          'Target Count': { number: camp.target_count || 0 },
          'Sent Count':   { number: camp.sent_count || 0 },
          'Created':      { date: { start: camp.created_at || new Date().toISOString() } }
        }
      });

      await supabase.from('notion_sync_log').upsert({
        table_name: 'crm_campaigns',
        record_id: camp.id,
        notion_page_id: page.id,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'table_name,record_id' });
      synced++;
    } catch (err) {
      console.error(`[notion-sync] Failed to sync campaign ${camp.id}: ${err.message}`);
    }
  }

  return { synced, total: campaigns.length };
}

async function syncSecretsList() {
  if (!supabase) return { synced: 0, error: 'Supabase not configured' };
  const dbId = secrets.getSecret('NOTION_DB_SECRETS_VAULT');
  if (!dbId) return { synced: 0, error: 'database not initialized' };

  // Only sync key names + metadata, NEVER values
  const allSecrets = await secrets.listSecrets();
  let synced = 0;

  for (const s of allSecrets) {
    try {
      const { data: existing } = await supabase
        .from('notion_sync_log')
        .select('id')
        .eq('table_name', 'secrets_vault')
        .eq('record_id', s.key_name)
        .single();
      if (existing) continue;

      const page = await notionFetch('/pages', 'POST', {
        parent: { database_id: dbId },
        properties: {
          'Key Name':     { title: [{ text: { content: s.key_name } }] },
          'Service':      { select: { name: s.service || 'API' } },
          'Status':       { select: { name: s.status || 'active' } },
          'Updated By':   { rich_text: [{ text: { content: s.updated_by || 'system' } }] },
          'Last Updated': { date: { start: s.updated_at || new Date().toISOString() } }
        }
      });

      await supabase.from('notion_sync_log').upsert({
        table_name: 'secrets_vault',
        record_id: s.key_name,
        notion_page_id: page.id,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'table_name,record_id' });
      synced++;
    } catch (err) {
      console.error(`[notion-sync] Failed to sync secret "${s.key_name}": ${err.message}`);
    }
  }

  return { synced, total: allSecrets.length };
}

async function getStats() {
  if (!supabase) return { error: 'Supabase not configured' };

  try {
    const { count: totalLeads } = await supabase.from('crm_leads').select('*', { count: 'exact', head: true });
    const leadsByStatus = {};
    for (const s of ['prospect', 'qualified', 'deal', 'won', 'lost']) {
      const { count } = await supabase.from('crm_leads').select('*', { count: 'exact', head: true }).eq('status', s);
      leadsByStatus[s] = count || 0;
    }
    const { count: campaignsActive } = await supabase.from('crm_campaigns').select('*', { count: 'exact', head: true }).eq('status', 'active');
    const { count: syncedCount } = await supabase.from('notion_sync_log').select('*', { count: 'exact', head: true });

    return {
      total_leads: totalLeads || 0,
      leads_by_status: leadsByStatus,
      campaigns_active: campaignsActive || 0,
      synced_to_notion: syncedCount || 0,
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function syncAll() {
  const results = {};
  results.leads = await syncLeads();
  results.campaigns = await syncCampaigns();
  results.secrets = await syncSecretsList();
  results.stats = await getStats();
  return results;
}

module.exports = { init, syncLeads, syncCampaigns, syncSecretsList, syncAll, getStats, getOrCreateDatabase };
