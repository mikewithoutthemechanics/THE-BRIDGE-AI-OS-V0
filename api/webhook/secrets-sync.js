/**
 * Vercel Serverless Function: POST /api/webhook/secrets-sync
 * Receives secret updates from Notion (via Zapier) and syncs to Supabase
 *
 * Zapier flow: Notion (Secrets Vault updated) → POST this endpoint
 */

const { syncSecretsFromNotion } = require('../../lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify Zapier webhook signature
  const signature = req.headers['x-zapier-signature'];
  if (signature) {
    const crypto = require('crypto');
    const body = JSON.stringify(req.body);
    const secret = process.env.ZAPIER_WEBHOOK_SECRET || 'webhook-secret';
    const expected = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('base64');

    if (signature !== expected) {
      console.warn('[WEBHOOK] Invalid Zapier signature');
      return res.status(403).json({ error: 'Invalid signature' });
    }
  }

  try {
    const { keyName, keyValue, service, updatedBy } = req.body;

    if (!keyName || !keyValue) {
      return res.status(400).json({ error: 'Missing keyName or keyValue' });
    }

    // Sync to Supabase
    const result = await syncSecretsFromNotion({
      keyName,
      keyValue,
      service: service || 'API',
      updatedBy: updatedBy || 'notion'
    });

    console.log(`[SECRETS-SYNC] Updated: ${keyName}`);
    res.json({ success: true, message: `Synced: ${keyName}` });
  } catch (err) {
    console.error('[SECRETS-SYNC] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
