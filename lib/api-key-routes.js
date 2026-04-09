/**
 * BRIDGE AI OS — API Key Management Routes
 *
 * Endpoints:
 *   POST /api/keys/create   — create a new API key
 *   GET  /api/keys/usage    — get usage stats (requires X-API-Key)
 *   GET  /api/keys/validate — validate a key   (requires X-API-Key)
 */

'use strict';

const apiKeys = require('./api-keys');
const { validate } = require('./validation');

function registerApiKeyRoutes(app) {

  /**
   * POST /api/keys/create
   * Body: { email: string, plan?: 'starter'|'pro'|'enterprise' }
   * Returns: { success, key_id, api_key, email, plan, rate_limit_per_min, brdg_balance }
   */
  app.post('/api/keys/create', [validate.createApiKey], async (req, res) => {
    try {
      const { email, plan } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'email is required' });
      }

      const result = await apiKeys.createKey(email, plan || 'starter');
      return res.status(201).json({
        success: true,
        ...result,
        message: `API key created. Store your key securely — it will not be shown again.`,
      });
    } catch (err) {
      const status = err.message.includes('Invalid plan') ? 400 : 500;
      return res.status(status).json({ error: err.message });
    }
  });

  /**
   * GET /api/keys/usage
   * Header: X-API-Key or Authorization: Bearer brdg_live_xxx
   * Returns: usage stats for the key
   */
  app.get('/api/keys/usage', [validate.apiKeyUsage], async (req, res) => {
    try {
      const apiKey = extractApiKey(req);
      if (!apiKey) {
        return res.status(401).json({ error: 'Missing API key. Provide X-API-Key header or Authorization: Bearer <key>' });
      }

      const usage = await apiKeys.getUsage(apiKey);
      if (!usage) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      return res.json({ success: true, usage });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/keys/validate
   * Header: X-API-Key or Authorization: Bearer brdg_live_xxx
   * Returns: key data if valid
   */
  app.get('/api/keys/validate', [validate.validateApiKey], async (req, res) => {
    try {
      const apiKey = extractApiKey(req);
      if (!apiKey) {
        return res.status(401).json({ error: 'Missing API key. Provide X-API-Key header or Authorization: Bearer <key>' });
      }

      const data = await apiKeys.validateKey(apiKey);
      if (!data) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      return res.json({ success: true, valid: true, key: data });
    } catch (err) {
      if (err.code === 'RATE_LIMITED') {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          retry_after_secs: err.retryAfterSecs,
        });
      }
      return res.status(500).json({ error: err.message });
    }
  });
  /**
   * POST /api/keys/topup
   * Body: { zar_amount: number }
   * Header: X-API-Key or Authorization: Bearer brdg_live_xxx
   * Credits BRDG at rate 1 ZAR = 10 BRDG
   */
  app.post('/api/keys/topup', [validate.apiKeyTopup], async (req, res) => {
    try {
      const apiKey = extractApiKey(req);
      if (!apiKey) {
        return res.status(401).json({ error: 'Missing API key. Provide X-API-Key header or Authorization: Bearer <key>' });
      }

      const usage = await apiKeys.getUsage(apiKey);
      if (!usage) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const { zar_amount } = req.body;
      if (!zar_amount || typeof zar_amount !== 'number' || zar_amount <= 0) {
        return res.status(400).json({ error: 'zar_amount must be a positive number' });
      }

      const ZAR_TO_BRDG = 10;
      const brdgAmount = zar_amount * ZAR_TO_BRDG;

      // Credit local key balance
      const result = await apiKeys.addCredits(apiKey, brdgAmount);

      // Also credit the agent-ledger for on-chain accounting
      let agentLedger;
      try { agentLedger = require('./agent-ledger'); } catch (_) { agentLedger = null; }
      if (agentLedger && typeof agentLedger.credit === 'function') {
        try {
          await agentLedger.credit(
            usage.email,
            brdgAmount,
            'api_topup',
            'API key topup: R' + zar_amount + ' = ' + brdgAmount + ' BRDG'
          );
        } catch (_) {
          // Ledger credit failed — local balance still updated
        }
      }

      return res.json({
        success: true,
        zar_amount,
        brdg_credited: brdgAmount,
        exchange_rate: ZAR_TO_BRDG,
        new_balance: result.new_balance,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });
}

/**
 * Extract API key from request headers.
 * Supports: X-API-Key header or Authorization: Bearer brdg_live_xxx
 */
function extractApiKey(req) {
  // Check X-API-Key header first
  const xApiKey = req.headers['x-api-key'];
  if (xApiKey) return xApiKey;

  // Check Authorization: Bearer header
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token.startsWith('brdg_live_')) return token;
  }

  return null;
}

module.exports = { registerApiKeyRoutes, extractApiKey };
