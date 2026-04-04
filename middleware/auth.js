const jwt = require('jsonwebtoken');

// Redis-backed token revocation with graceful fallback to in-memory Set
let redisClient = null;
const revokedTokens = new Set();

// Attempt Redis connection, fall back silently
(async () => {
  try {
    const redis = require('redis');
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: { connectTimeout: 3000, reconnectStrategy: (retries) => retries > 3 ? false : 1000 }
    });
    redisClient.on('error', () => {}); // suppress connection errors
    await redisClient.connect();
    console.log('[AUTH-MW] Redis connected for token revocation');
  } catch (_) {
    redisClient = null;
    console.log('[AUTH-MW] Redis unavailable — using in-memory token revocation');
  }
})();

// Prune in-memory set periodically to prevent unbounded growth
setInterval(() => { if (revokedTokens.size > 50000) revokedTokens.clear(); }, 10 * 60 * 1000);

const requireAuth = (requiredAuthority = null) => {
  return async (req, res, next) => {
    try {
      // Support both cookie-based and header-based tokens
      const token = req.cookies?.access_token
        || (req.headers.authorization || '').replace(/^Bearer\s+/, '')
        || req.query?.token;

      if (!token) {
        return res.status(401).json({ error: 'Missing auth token' });
      }

      // Check token revocation (Redis or in-memory)
      if (redisClient) {
        try {
          const revoked = await redisClient.get(`revoked:${token}`);
          if (revoked) return res.status(401).json({ error: 'Token revoked' });
        } catch (_) {
          // Redis read failed — fall through to in-memory check
          if (revokedTokens.has(token)) return res.status(401).json({ error: 'Token revoked' });
        }
      } else {
        if (revokedTokens.has(token)) return res.status(401).json({ error: 'Token revoked' });
      }

      const secret = process.env.JWT_SECRET || 'aoe-unified-super-secret-change-in-prod';
      const decoded = jwt.verify(token, secret);

      // Attach user context
      req.user = decoded;
      req.token = token;

      // Authority enforcement (optional)
      if (requiredAuthority) {
        const userAuthority = decoded.authority || decoded.role || null;
        if (userAuthority !== requiredAuthority) {
          return res.status(403).json({ error: 'Insufficient authority' });
        }
      }

      next();
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

// Utility: revoke a token
async function revokeToken(token, ttlSeconds = 86400) {
  revokedTokens.add(token);
  if (redisClient) {
    try { await redisClient.set(`revoked:${token}`, '1', { EX: ttlSeconds }); } catch (_) {}
  }
}

module.exports = { requireAuth, revokeToken };