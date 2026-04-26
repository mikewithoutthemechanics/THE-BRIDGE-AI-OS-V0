/**
 * BRIDGE AI OS — API Key Authentication Middleware
 *
 * Express middleware that:
 *  1. Extracts API key from X-API-Key or Authorization: Bearer brdg_live_xxx
 *  2. Validates the key and checks rate limits
 *  3. Deducts 1 BRDG credit per call
 *  4. Sets req.apiUser with key data
 *  5. Returns 401 (invalid), 402 (no balance), or 429 (rate-limited)
 *
 * Usage:
 *   const apiKeyAuth = require('./middleware/api-key-auth');
 *   app.use('/api/v1', apiKeyAuth);
 */

'use strict';

const apiKeys = require('../lib/api-keys');
const { extractApiKey } = require('../lib/api-key-routes');

/**
 * API key authentication middleware.
 * @param {number} [creditCost=1] - BRDG credits to deduct per call
 */
function apiKeyAuth(creditCost = 1) {
  // If called without args (app.use(apiKeyAuth)), handle both cases
  if (typeof creditCost === 'object') {
    // Called as middleware directly: apiKeyAuth(req, res, next)
    return _handler(1, creditCost, arguments[1], arguments[2]);
  }

  // Called as factory: apiKeyAuth(2)
  return (req, res, next) => _handler(creditCost, req, res, next);
}

async function _handler(creditCost, req, res, next) {
  try {
    // 1. Extract API key
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Provide API key via X-API-Key header or Authorization: Bearer <key>',
      });
    }

    // 2. Validate key and check rate limit
    let keyData;
    try {
      keyData = await apiKeys.validateKey(apiKey);
    } catch (err) {
      if (err.code === 'RATE_LIMITED') {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          retry_after_secs: err.retryAfterSecs || 60,
          plan: undefined, // will be set below if we can look up the key
          message: `Your plan allows ${err.limit || 'limited'} requests per minute. Upgrade your plan for higher limits.`,
        });
      }
      throw err;
    }

    if (!keyData) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'The provided API key is not valid or has been revoked.',
      });
    }

    // 3. Deduct BRDG credit
    try {
      await apiKeys.deductCredit(apiKey, creditCost);
    } catch (err) {
      if (err.code === 'INSUFFICIENT_BALANCE') {
        return res.status(402).json({
          error: 'Insufficient BRDG balance',
          balance: err.balance,
          message: 'Top up your BRDG credits to continue using the API.',
        });
      }
      throw err;
    }

    // 4. Attach user data to request
    req.apiUser = {
      key_id: keyData.key_id,
      api_key: keyData.api_key,
      email: keyData.email,
      plan: keyData.plan,
      rate_limit_per_min: keyData.rate_limit_per_min,
      calls_today: keyData.calls_today,
      calls_total: keyData.calls_total,
      brdg_balance: keyData.brdg_balance - creditCost,
    };

    next();
  } catch (err) {
    console.error('[api-key-auth] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Internal authentication error' });
  }
}

module.exports = apiKeyAuth;
