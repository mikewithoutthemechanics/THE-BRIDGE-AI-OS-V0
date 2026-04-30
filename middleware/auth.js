const jwt = require('jsonwebtoken');
const { EMAILS: SUPERUSERS, isSuperUserEmail } = require('../shared/superusers');
const { isAuthBypassed, bypassJwtUser, logBypassOnce } = require('../shared/auth-bypass');
// Supabase-backed revocation store — shared with auth.js (Vercel cold-start safe)
const revokedStore = (() => { try { return require('../lib/revoked-tokens'); } catch(_) { return null; } })();
const { supabaseAdmin } = require('../lib/supabase');


/**
 * Returns true if the given email belongs to a superuser.
 * Comparison is case-insensitive. Reads from shared/superusers.json via the
 * shared loader, which has a hardcoded fallback.
 * @param {string} email
 * @returns {boolean}
 */
function isSuperUser(email) {
  return isSuperUserEmail(email);
}

// Redis-backed token revocation with graceful fallback to TTL-based in-memory Map
let redisClient = null;
const revokedTokens = new Map(); // token → expiry timestamp (ms)

// Skip eager Redis in Jest — async connect() completes after suites and leaks handles / logs "after tests done"
const skipEagerRedis = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';

// Attempt Redis connection, fall back silently
if (!skipEagerRedis) {
  (async () => {
    try {
      const redis = require('redis');
      redisClient = redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: { connectTimeout: 3000, reconnectStrategy: (retries) => retries > 3 ? false : 1000 }
      });
      redisClient.on('error', () => {});
      await redisClient.connect();
      console.log('[AUTH-MW] Redis connected for token revocation');
    } catch (_) {
      redisClient = null;
      console.log('[AUTH-MW] Redis unavailable — using in-memory token revocation');
    }
  })();
}

// TTL-based cleanup: remove expired revocations every 5 minutes (.unref so Jest can exit)
const revokeCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [token, expiresAt] of revokedTokens) {
    if (expiresAt <= now) revokedTokens.delete(token);
  }
}, 5 * 60 * 1000);
revokeCleanupTimer.unref();

async function shutdownAuthMiddleware() {
  clearInterval(revokeCleanupTimer);
  if (redisClient) {
    try { await redisClient.quit(); } catch (_) {}
    redisClient = null;
  }
}

function isTokenRevoked(token) {
  const expiresAt = revokedTokens.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) { revokedTokens.delete(token); return false; }
  return true;
}

const requireAuth = (requiredAuthority = null) => {
  return async (req, res, next) => {
    try {
      // Development bypass: allow immediate access when feature flag enabled
      if (isAuthBypassed()) {
        logBypassOnce();
        req.user = bypassJwtUser();
        req.token = 'bypass';
        return next();
      }

      // Support both cookie-based and header-based tokens
      const token = req.cookies?.access_token
        || (req.headers.authorization || '').replace(/^Bearer\s+/, '')
        || req.query?.token;

      if (!token) {
        return res.status(401).json({ error: 'Missing auth token' });
      }

      // Check token revocation (applies to JWT tokens)
      let alreadyRevoked = false;
      if (redisClient) {
        try {
          const revoked = await redisClient.get(`revoked:${token}`);
          if (revoked) alreadyRevoked = true;
        } catch (_) {
          if (isTokenRevoked(token)) alreadyRevoked = true;
        }
      } else if (isTokenRevoked(token)) {
        alreadyRevoked = true;
      }
      if (!alreadyRevoked && revokedStore) {
        try {
          if (await revokedStore.isRevoked(token)) {
            alreadyRevoked = true;
            revokedTokens.set(token, Date.now() + 7 * 24 * 3600 * 1000);
          }
        } catch (_) {}
      }
      if (alreadyRevoked) return res.status(401).json({ error: 'Token revoked' });

      // Try JWT verification if secret configured
      const secret = process.env.JWT_SECRET;
      if (secret) {
        try {
          const decoded = jwt.verify(token, secret);
          req.user = decoded;
          req.token = token;

          if (requiredAuthority) {
            const userAuthority = decoded.authority || decoded.role || null;
            if (userAuthority !== requiredAuthority) {
              return res.status(403).json({ error: 'Insufficient authority' });
            }
          }
          return next();
        } catch (err) {
          // JWT verification failed; continue to Supabase verification
        }
      }

      // Supabase token verification
      try {
        const { data: { user: supaUser }, error: supErr } = await supabaseAdmin.auth.admin.getUserByToken(token);
        if (supErr || !supaUser) {
          return res.status(401).json({ error: 'Invalid or expired token' });
        }
        req.user = {
          id: supaUser.id,
          email: supaUser.email,
          role: supaUser.user_metadata?.role || 'user',
          permissions: supaUser.user_metadata?.permissions || [],
          tenant: supaUser.user_metadata?.tenant || null,
        };
        req.token = token;

        if (requiredAuthority) {
          if (req.user.role !== requiredAuthority) {
            return res.status(403).json({ error: 'Insufficient authority' });
          }
        }
        return next();
      } catch (e) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    } catch (err) {
      console.log(JSON.stringify({
        event: 'AUTH_FAILURE',
        ip: req.ip || (req.connection && req.connection.remoteAddress) || 'unknown',
        route: req.originalUrl,
        reason: err.message,
        timestamp: new Date().toISOString()
      }));
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
};

// Utility: revoke a token (TTL defaults to 7 days = JWT expiry)
// Writes to all three layers so revocation survives cold starts + any
// single-layer outage.
async function revokeToken(token, ttlSeconds = 7 * 24 * 3600) {
  revokedTokens.set(token, Date.now() + ttlSeconds * 1000);
  if (redisClient) {
    try { await redisClient.set(`revoked:${token}`, '1', { EX: ttlSeconds }); } catch (_) {}
  }
  if (revokedStore) {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    try { await revokedStore.revoke(token, expiresAt); } catch (_) {}
  }
}

module.exports = { requireAuth, revokeToken, isTokenRevoked, shutdownAuthMiddleware, isSuperUser, SUPERUSERS };