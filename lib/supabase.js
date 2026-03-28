/**
 * Supabase client with secrets management
 * Syncs secrets from Notion → Supabase → Application runtime
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

// Client for public operations (anon key)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Client for admin operations (service key - server-side only)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ===== SECRETS MANAGEMENT =====
const secretsCache = {};
const SECRETS_TTL = 5 * 60 * 1000; // 5 minutes
let lastSecretSync = 0;

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
    if (envValue) {
      console.log(`[SECRETS] Using fallback from env: ${envKey}`);
      return envValue;
    }
    return fallback;
  }
}

/**
 * Store secret in Supabase (admin only)
 */
async function setSecret(keyName, keyValue, service = 'API', updatedBy = 'system') {
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

/**
 * Create lead in Supabase (replaces SQLite)
 */
async function createLead(email, company, osintProfile, source = 'scraper') {
  try {
    const { data, error } = await supabase
      .from('crm_leads')
      .insert({
        email,
        company,
        osint_profile: osintProfile,
        source,
        status: 'prospect',
        score: 0
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[CRM] Failed to create lead:', err.message);
    throw err;
  }
}

/**
 * Get lead by email
 */
async function getLead(email) {
  try {
    const { data, error } = await supabase
      .from('crm_leads')
      .select('*')
      .eq('email', email)
      .single();

    return data || null;
  } catch (err) {
    return null;
  }
}

/**
 * Update lead score and status (auto-qualify at 30+)
 */
async function updateLeadScore(leadId, scoreIncrement) {
  try {
    // Get current score
    const { data: lead, error: fetchErr } = await supabase
      .from('crm_leads')
      .select('score, status')
      .eq('id', leadId)
      .single();

    if (fetchErr) throw fetchErr;

    const newScore = (lead.score || 0) + scoreIncrement;
    let newStatus = lead.status;

    // Auto-qualify at score 30+
    if (newScore >= 30 && lead.status === 'prospect') {
      newStatus = 'qualified';
    }

    const { data, error } = await supabase
      .from('crm_leads')
      .update({
        score: newScore,
        status: newStatus,
        updated_at: new Date().toISOString()
      })
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

/**
 * Queue email in Supabase
 */
async function queueEmail(email, company, templateType = 'general', campaignId = null) {
  try {
    const { data, error } = await supabase
      .from('email_outreach')
      .insert({
        email,
        company,
        template_type: templateType,
        campaign_id: campaignId,
        status: 'queued'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[OUTREACH] Failed to queue email:', err.message);
    throw err;
  }
}

/**
 * Get queued emails for batch send
 */
async function getQueuedEmails(limit = 5) {
  try {
    const { data, error } = await supabase
      .from('email_outreach')
      .select('*')
      .eq('status', 'queued')
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[OUTREACH] Failed to get queued emails:', err.message);
    return [];
  }
}

/**
 * Mark email as sent
 */
async function markEmailSent(outreachId, email, subject, templateType) {
  try {
    // Insert in email_sent
    const { data: sent, error: sentErr } = await supabase
      .from('email_sent')
      .insert({
        outreach_id: outreachId,
        email,
        subject,
        template_type: templateType
      })
      .select()
      .single();

    if (sentErr) throw sentErr;

    // Update status in email_outreach
    await supabase
      .from('email_outreach')
      .update({ status: 'sent' })
      .eq('id', outreachId);

    return sent;
  } catch (err) {
    console.error('[EMAIL_SENT] Failed to mark email as sent:', err.message);
    throw err;
  }
}

/**
 * Track email open
 */
async function trackEmailOpen(sentId, ip, userAgent) {
  try {
    await supabase
      .from('email_opens')
      .insert({
        sent_id: sentId,
        ip,
        user_agent: userAgent
      });

    // Update lead score
    const { data: sent } = await supabase
      .from('email_sent')
      .select('email')
      .eq('id', sentId)
      .single();

    if (sent) {
      const lead = await getLead(sent.email);
      if (lead) {
        await updateLeadScore(lead.id, 5); // +5 for open
      }
    }
  } catch (err) {
    console.warn('[TRACKING] Failed to track open:', err.message);
  }
}

// ===== OSINT OPERATIONS =====

/**
 * Register OSINT profile in Supabase
 */
async function registerOsintProfile(taskId, url, title, emails, company, industry, sizeEstimate, templateType, profileConfidence, fullProfile) {
  try {
    const { data, error } = await supabase
      .from('osint_registry')
      .insert({
        task_id: taskId,
        url,
        company_name: company,
        industry,
        size_estimate: sizeEstimate,
        template_type: templateType,
        profile_confidence: profileConfidence,
        full_profile: fullProfile
      })
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

/**
 * Subscribe to lead changes (for live dashboard)
 */
function subscribeToLeadChanges(callback) {
  const subscription = supabase
    .from('crm_leads')
    .on('*', (payload) => {
      callback(payload);
    })
    .subscribe();

  return subscription;
}

/**
 * Subscribe to email sent events
 */
function subscribeToEmailSent(callback) {
  const subscription = supabase
    .from('email_sent')
    .on('INSERT', (payload) => {
      callback(payload.new);
    })
    .subscribe();

  return subscription;
}

module.exports = {
  supabase,
  supabaseAdmin,
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
