'use strict';

/**
 * notion-sync.js — Notion reporting layer for VPS-hosted unified DB
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

// Store created DB IDs in secrets_vault for persistence
async function getOrCreateDatabase(schemaKey) {
  const dbIdKey = `NOTION_DB_${schemaKey.toUpperCase()}`;
  const existingId = secrets.getSecret(dbIdKey);

  if (existingId) {
    // Verify it still exists
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
  secrets.setSecret(dbIdKey, result.id, 'Notion', 'notion-sync');
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

let Database;
try { Database = require('better-sqlite3'); } catch (_) { Database = null; }
const path = require('path');
const DB_PATH = path.join(__dirname, '..', 'users.db');

function getLocalDB(readonly = true) {
  if (!Database) throw new Error('better-sqlite3 not installed');
  const d = new Database(DB_PATH, { readonly });
  d.pragma('journal_mode = WAL');
  return d;
}

function getWritableDB() {
  if (!Database) throw new Error('better-sqlite3 not installed');
  const d = new Database(DB_PATH);
  d.pragma('journal_mode = WAL');
  return d;
}

async function syncLeads(limit = 50) {
  if (!Database) return { synced: 0, error: 'better-sqlite3 not installed' };
  const dbId = secrets.getSecret('NOTION_DB_CRM_LEADS');
  if (!dbId) return { synced: 0, error: 'database not initialized' };

  const localDb = getLocalDB();
  const syncLog = getWritableDB();

  // Get unsynced leads
  const leads = localDb.prepare(`
    SELECT l.* FROM crm_leads l
    LEFT JOIN notion_sync_log s ON s.table_name = 'crm_leads' AND s.record_id = l.id
    WHERE s.id IS NULL
    ORDER BY l.created_at DESC LIMIT ?
  `).all(limit);

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

      syncLog.prepare('INSERT OR REPLACE INTO notion_sync_log (table_name, record_id, notion_page_id) VALUES (?, ?, ?)')
        .run('crm_leads', lead.id, page.id);
      synced++;
    } catch (err) {
      console.error(`[notion-sync] Failed to sync lead ${lead.id}: ${err.message}`);
    }
  }

  localDb.close();
  syncLog.close();
  return { synced, total: leads.length };
}

async function syncCampaigns() {
  if (!Database) return { synced: 0, error: 'better-sqlite3 not installed' };
  const dbId = secrets.getSecret('NOTION_DB_CAMPAIGNS');
  if (!dbId) return { synced: 0, error: 'database not initialized' };

  const localDb = getLocalDB();
  const syncLog = getWritableDB();

  const campaigns = localDb.prepare(`
    SELECT c.* FROM crm_campaigns c
    LEFT JOIN notion_sync_log s ON s.table_name = 'crm_campaigns' AND s.record_id = c.id
    WHERE s.id IS NULL
    ORDER BY c.created_at DESC
  `).all();

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

      syncLog.prepare('INSERT OR REPLACE INTO notion_sync_log (table_name, record_id, notion_page_id) VALUES (?, ?, ?)')
        .run('crm_campaigns', camp.id, page.id);
      synced++;
    } catch (err) {
      console.error(`[notion-sync] Failed to sync campaign ${camp.id}: ${err.message}`);
    }
  }

  localDb.close();
  syncLog.close();
  return { synced, total: campaigns.length };
}

async function syncSecretsList() {
  if (!Database) return { synced: 0, error: 'better-sqlite3 not installed' };
  const dbId = secrets.getSecret('NOTION_DB_SECRETS_VAULT');
  if (!dbId) return { synced: 0, error: 'database not initialized' };

  // Only sync key names + metadata, NEVER values
  const allSecrets = secrets.listSecrets();
  let synced = 0;

  for (const s of allSecrets) {
    try {
      // Check if already synced
      const checkDb = getLocalDB();
      const existing = checkDb.prepare("SELECT 1 FROM notion_sync_log WHERE table_name = 'secrets_vault' AND record_id = ?")
        .get(s.key_name);
      checkDb.close();

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

      const writeDb = getWritableDB();
      writeDb.prepare('INSERT OR REPLACE INTO notion_sync_log (table_name, record_id, notion_page_id) VALUES (?, ?, ?)')
        .run('secrets_vault', s.key_name, page.id);
      writeDb.close();
      synced++;
    } catch (err) {
      console.error(`[notion-sync] Failed to sync secret "${s.key_name}": ${err.message}`);
    }
  }

  return { synced, total: allSecrets.length };
}

async function getStats() {
  if (!Database) return { error: 'better-sqlite3 not installed' };
  const localDb = getLocalDB();

  const stats = {
    total_leads: localDb.prepare('SELECT COUNT(*) as c FROM crm_leads').get().c,
    leads_by_status: {},
    avg_score: Math.round(localDb.prepare('SELECT AVG(score) as a FROM crm_leads').get().a || 0),
    campaigns_active: localDb.prepare("SELECT COUNT(*) as c FROM crm_campaigns WHERE status = 'active'").get().c,
    emails_queued: localDb.prepare("SELECT COUNT(*) as c FROM email_outreach WHERE status = 'queued'").get().c,
    emails_sent: localDb.prepare('SELECT COUNT(*) as c FROM email_sent').get().c,
    emails_opened: localDb.prepare('SELECT COUNT(*) as c FROM email_opens').get().c,
    emails_clicked: localDb.prepare('SELECT COUNT(*) as c FROM email_clicks').get().c,
    secrets_count: localDb.prepare("SELECT COUNT(*) as c FROM secrets_vault WHERE status = 'active'").get().c,
    osint_profiles: localDb.prepare('SELECT COUNT(*) as c FROM osint_registry').get().c,
    synced_to_notion: localDb.prepare('SELECT COUNT(*) as c FROM notion_sync_log').get().c,
    last_sync: localDb.prepare('SELECT MAX(synced_at) as t FROM notion_sync_log').get().t
  };

  for (const s of ['prospect', 'qualified', 'deal', 'won', 'lost']) {
    stats.leads_by_status[s] = localDb.prepare('SELECT COUNT(*) as c FROM crm_leads WHERE status = ?').get(s).c;
  }

  localDb.close();
  return stats;
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
