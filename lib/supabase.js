/**
 * Supabase client with secrets management
 * Syncs secrets from Notion → Supabase → Application runtime
 * Gracefully handles missing @supabase/supabase-js dependency
 */

let createClient;
try {
  ({ createClient } = require('@supabase/supabase-js'));
} catch (_) {
  console.warn('[SUPABASE] @supabase/supabase-js not installed — using stub client');
  createClient = null;
}

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

// Stub client that returns empty results without crashing
function createStubClient() {
  const handler = {
    get(target, prop) {
      if (prop === 'from') return () => new Proxy({}, handler);
      if (['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'containedBy', 'single', 'limit', 'order', 'range', 'match', 'not', 'or', 'filter', 'on', 'subscribe'].includes(prop)) {
        return (...args) => new Proxy({ data: null, error: { message: 'Supabase not configured' } }, handler);
      }
      if (prop === 'then') return undefined; // not a promise
      if (prop === 'data') return null;
      if (prop === 'error') return { message: 'Supabase not configured' };
      return () => new Proxy({}, handler);
    }
  };
  return new Proxy({}, handler);
}

const isConfigured = createClient && SUPABASE_URL && SUPABASE_URL !== 'https://your-project.supabase.co' && SUPABASE_ANON_KEY;

// Client for public operations (anon key)
const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : createStubClient();

// Client for admin operations (service key - server-side only)
const supabaseAdmin = (isConfigured && SUPABASE_SERVICE_KEY) ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : createStubClient();

if (!isConfigured) {
  console.log('[SUPABASE] Not configured — set SUPABASE_URL and SUPABASE_ANON_KEY for live Supabase');
}

// ===== SECRETS MANAGEMENT =====
const secretsCache = {};
const SECRETS_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get secret from cache or Supabase
 * Falls back to env vars if not in Supabase
 */
async function getSecret(keyName, fallback = null) {
  const cacheKey = keyName.toUpperCase();
  const now = Date.now();

  // Check cache
  if (secretsCache[cacheKey] && (now - secretsCache[cacheKey].ts) < SECRETS_TTL) {
    return secretsCache[cacheKey].value;
  }

  if (!isConfigured) {
    // Fall back to env var
    const envKey = keyName.toUpperCase().replace(/-/g, '_');
    return process.env[envKey] || process.env[keyName] || fallback;
  }

  try {
    const { data, error } = await supabase
      .from('secrets_vault')
      .select('key_value, status')
      .eq('key_name', keyName)
      .eq('status', 'active')
      .single();

    if (error) throw error;
    if (!data) throw new Error(`Secret "${keyName}" not found or inactive`);

    // Cache it
    secretsCache[cacheKey] = { value: data.key_value, ts: now };
    return data.key_value;
  } catch (err) {
    console.warn(`[SECRETS] Failed to fetch "${keyName}" from Supabase: ${err.message}`);
    // Fall back to env var
    const envKey = keyName.toUpperCase().replace(/-/g, '_');
    const envValue = process.env[envKey];
    if (envValue) return envValue;
    return fallback;
  }
}

/**
 * Store secret in Supabase (admin only)
 */
async function setSecret(keyName, keyValue, service = 'API', updatedBy = 'system') {
  if (!isConfigured) {
    console.warn(`[SECRETS] Supabase not configured — cannot persist "${keyName}"`);
    return null;
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('secrets_vault')
      .upsert({
        key_name: keyName,
        key_value: keyValue,
        service,
        updated_by: updatedBy,
        last_updated: new Date().toISOString()
      }, { onConflict: 'key_name' });

    if (error) throw error;

    // Invalidate cache
    delete secretsCache[keyName.toUpperCase()];
    console.log(`[SECRETS] Updated "${keyName}" in Supabase`);
    return data;
  } catch (err) {
    console.error(`[SECRETS] Failed to set "${keyName}":`, err.message);
    throw err;
  }
}

/**
 * Sync secrets from Notion (called by Zapier webhook)
 */
async function syncSecretsFromNotion(notionData) {
  try {
    const { keyName, keyValue, service, updatedBy } = notionData;
    await setSecret(keyName, keyValue, service, updatedBy);
    return { success: true, message: `Synced secret: ${keyName}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Webhook for Zapier → Supabase secrets sync
 */
function createSecretsWebhook() {
  return async (req, res) => {
    const { method, body } = req;

    if (method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Verify webhook signature (if using Zapier signed webhooks)
    const signature = req.headers['x-zapier-signature'];
    if (signature) {
      const crypto = require('crypto');
      const expected = crypto
        .createHmac('sha256', process.env.ZAPIER_WEBHOOK_SECRET || 'secret')
        .update(JSON.stringify(body))
        .digest('hex');

      if (signature !== expected) {
        return res.status(403).json({ error: 'Invalid signature' });
      }
    }

    try {
      const result = await syncSecretsFromNotion(body);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
}

// ===== CRM OPERATIONS =====

async function createLead(email, company, osintProfile, source = 'scraper') {
  if (!isConfigured) return { id: `local_${Date.now()}`, email, company, source, status: 'prospect', score: 0 };
  try {
    const { data, error } = await supabase
      .from('crm_leads')
      .insert({ email, company, osint_profile: osintProfile, source, status: 'prospect', score: 0 })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[CRM] Failed to create lead:', err.message);
    throw err;
  }
}

async function getLead(email) {
  if (!isConfigured) return null;
  try {
    const { data } = await supabase
      .from('crm_leads')
      .select('*')
      .eq('email', email)
      .single();
    return data || null;
  } catch (_) {
    return null;
  }
}

async function updateLeadScore(leadId, scoreIncrement) {
  if (!isConfigured) return null;
  try {
    const { data: lead, error: fetchErr } = await supabase
      .from('crm_leads')
      .select('score, status')
      .eq('id', leadId)
      .single();
    if (fetchErr) throw fetchErr;

    const newScore = (lead.score || 0) + scoreIncrement;
    let newStatus = lead.status;
    if (newScore >= 30 && lead.status === 'prospect') newStatus = 'qualified';

    const { data, error } = await supabase
      .from('crm_leads')
      .update({ score: newScore, status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', leadId)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[CRM] Failed to update lead score:', err.message);
    throw err;
  }
}

// ===== EMAIL OPERATIONS =====

async function queueEmail(email, company, templateType = 'general', campaignId = null) {
  if (!isConfigured) return { id: `local_${Date.now()}`, email, company, status: 'queued' };
  try {
    const { data, error } = await supabase
      .from('email_outreach')
      .insert({ email, company, template_type: templateType, campaign_id: campaignId, status: 'queued' })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[OUTREACH] Failed to queue email:', err.message);
    throw err;
  }
}

async function getQueuedEmails(limit = 5) {
  if (!isConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('email_outreach')
      .select('*')
      .eq('status', 'queued')
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (_) {
    return [];
  }
}

async function markEmailSent(outreachId, email, subject, templateType) {
  if (!isConfigured) return { id: `local_${Date.now()}`, email, subject };
  try {
    const { data: sent, error: sentErr } = await supabase
      .from('email_sent')
      .insert({ outreach_id: outreachId, email, subject, template_type: templateType })
      .select()
      .single();
    if (sentErr) throw sentErr;
    await supabase.from('email_outreach').update({ status: 'sent' }).eq('id', outreachId);
    return sent;
  } catch (err) {
    console.error('[EMAIL_SENT] Failed to mark email as sent:', err.message);
    throw err;
  }
}

async function trackEmailOpen(sentId, ip, userAgent) {
  if (!isConfigured) return;
  try {
    await supabase.from('email_opens').insert({ sent_id: sentId, ip, user_agent: userAgent });
    const { data: sent } = await supabase.from('email_sent').select('email').eq('id', sentId).single();
    if (sent) {
      const lead = await getLead(sent.email);
      if (lead) await updateLeadScore(lead.id, 5);
    }
  } catch (err) {
    console.warn('[TRACKING] Failed to track open:', err.message);
  }
}

// ===== OSINT OPERATIONS =====

async function registerOsintProfile(taskId, url, title, emails, company, industry, sizeEstimate, templateType, profileConfidence, fullProfile) {
  if (!isConfigured) return { id: `local_${Date.now()}`, task_id: taskId, company_name: company };
  try {
    const { data, error } = await supabase
      .from('osint_registry')
      .insert({ task_id: taskId, url, company_name: company, industry, size_estimate: sizeEstimate, template_type: templateType, profile_confidence: profileConfidence, full_profile: fullProfile })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[OSINT] Failed to register profile:', err.message);
    throw err;
  }
}

// ===== REALTIME SUBSCRIPTIONS =====

function subscribeToLeadChanges(callback) {
  if (!isConfigured) { console.warn('[SUPABASE] Realtime not available — not configured'); return null; }
  try {
    return supabase.channel('crm_leads_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_leads' }, callback)
      .subscribe();
  } catch (err) {
    console.warn('[SUPABASE] Realtime subscription failed:', err.message);
    return null;
  }
}

function subscribeToEmailSent(callback) {
  if (!isConfigured) { console.warn('[SUPABASE] Realtime not available — not configured'); return null; }
  try {
    return supabase.channel('email_sent_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'email_sent' }, (payload) => callback(payload.new))
      .subscribe();
  } catch (err) {
    console.warn('[SUPABASE] Realtime subscription failed:', err.message);
    return null;
  }
}

module.exports = {
  supabase,
  supabaseAdmin,
  isConfigured,
  getSecret,
  setSecret,
  syncSecretsFromNotion,
  createSecretsWebhook,
  createLead,
  getLead,
  updateLeadScore,
  queueEmail,
  getQueuedEmails,
  markEmailSent,
  trackEmailOpen,
  registerOsintProfile,
  subscribeToLeadChanges,
  subscribeToEmailSent
};