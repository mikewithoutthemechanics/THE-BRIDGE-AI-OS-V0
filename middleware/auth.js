const jwt = require('jsonwebtoken');
const redis = require('redis');
const redisClient = redis.createClient();

redisClient.connect().catch(console.error);

const requireAuth = (requiredAuthority = null) => {
  return async (req, res, next) => {
    try {
      const token = req.cookies?.access_token;

      if (!token) {
        return res.status(401).json({ error: 'Missing auth token' });
      }

      // Check token revocation
      const revoked = await redisClient.get(`revoked:${token}`);
      if (revoked) {
        return res.status(401).json({ error: 'Token revoked' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Validate authority
      if (!decoded.authority || typeof decoded.authority !== 'string') {
        return res.status(403).json({ error: 'Invalid authority' });
      }

      // Attach user context
      req.user = decoded;

      // Cortex authority enforcement
      if (requiredAuthority) {
        const userAuthority = decoded.authority;

        if (userAuthority !== requiredAuthority) {
          return res.status(403).json({ error: 'Insufficient authority' });
        }
      }

      next();
    } catch (err) {
      console.log(JSON.stringify({
        event: 'AUTH_FAILURE',
        ip: req.ip || req.connection.remoteAddress,
        route: req.originalUrl,
        reason: err.message,
        timestamp: new Date().toISOString()
      }));
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
};

module.exports = { requireAuth };