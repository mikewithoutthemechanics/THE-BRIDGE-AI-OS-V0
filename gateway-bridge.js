// Extended Gateway for Bridge AI OS
// Routes between THIS SIDE ↔ OTHER SIDE intelligently
// Maintains single identity + unified state across both systems

const express = require('express');
const redis = require('redis');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 8080;
const BRIDGE_SERVICE = process.env.BRIDGE_SERVICE_URL || 'http://bridge-service:9000';

// =============================================
// CONSTANTS
// =============================================

const SERVICE_SIDE = process.env.SERVICE_SIDE || 'this';

// =============================================
// MIDDLEWARE
// =============================================

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests'
});
app.use(limiter);

// =============================================
// REDIS CLIENT
// =============================================

const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  password: process.env.REDIS_PASS
});

redisClient.on('error', (err) => console.error('[GATEWAY] Redis error:', err));
redisClient.on('connect', () => console.log(`[GATEWAY-${SERVICE_SIDE.toUpperCase()}] Redis connected`));

// =============================================
// BRIDGE-AWARE JWT AUTH
// =============================================

const authenticateJWT = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    req.user = decoded;

    // Tag with side for sync tracking
    req.user.accessedSide = SERVICE_SIDE;
    req.user.bridgeAware = true;

    // Store in Redis for cross-side validation
    await redisClient.setEx(
      `user:${decoded.id}:session`,
      3600,
      JSON.stringify({ ...decoded, accessedSide: SERVICE_SIDE, timestamp: Date.now() })
    );

    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token', details: err.message });
  }
};

// =============================================
// DUAL-SIDE REQUEST CONTEXT
// =============================================

const bridgeContext = (req, res, next) => {
  req.bridgeContext = {
    side: SERVICE_SIDE,
    requestId: req.headers['x-request-id'] || crypto.randomUUID(),
    timestamp: Date.now(),
    taskType: req.headers['x-task-type'] || 'general'
  };
  next();
};

app.use(bridgeContext);

// =============================================
// INTELLIGENT ROUTING MIDDLEWARE
// =============================================

const intelligentRoute = async (req, res, next) => {
  try {
    // Query bridge for routing decision
    const routing = await axios.post(`${BRIDGE_SERVICE}/route`, {
      taskType: req.bridgeContext.taskType,
      userId: req.user?.id
    });

    req.bridgeContext.decidedSide = routing.data.decidedSide;
    req.bridgeContext.routingMetrics = routing.data.metrics;

    // Log routing decision
    console.log(`[GATEWAY-${SERVICE_SIDE.toUpperCase()}] Route: ${req.path} → ${routing.data.decidedSide}`);

    next();
  } catch (err) {
    console.warn('[GATEWAY] Bridge routing failed, using local side:', err.message);
    req.bridgeContext.decidedSide = SERVICE_SIDE;
    next();
  }
};

// =============================================
// SERVICE ROUTING WITH BRIDGE AWARENESS
// =============================================

// Main service (local)
app.use('/api/agent', intelligentRoute, createProxyMiddleware({
  target: process.env.MAIN_SERVICE_URL || 'http://localhost:3000',
  changeOrigin: true,
  pathRewrite: { '^/api': '' },
  onProxyReq: (proxyReq, req, res) => {
    proxyReq.setHeader('x-bridge-context', JSON.stringify(req.bridgeContext));
  },
  onError: (err, req, res) => {
    console.error('[GATEWAY] Main service error:', err.message);
    res.status(503).json({ error: 'Main service unavailable' });
  }
}));

// Brain service (local)
app.use('/brain', intelligentRoute, createProxyMiddleware({
  target: process.env.BRAIN_SERVICE_URL || 'http://localhost:8000',
  changeOrigin: true,
  onProxyReq: (proxyReq, req, res) => {
    proxyReq.setHeader('x-bridge-context', JSON.stringify(req.bridgeContext));
  },
  onError: (err, req, res) => {
    console.error('[GATEWAY] Brain service error:', err.message);
    res.status(503).json({ error: 'Brain service unavailable' });
  }
}));

// SVG engine (local)
app.use('/svg', intelligentRoute, createProxyMiddleware({
  target: process.env.SVG_SERVICE_URL || 'http://localhost:7070',
  changeOrigin: true,
  onProxyReq: (proxyReq, req, res) => {
    proxyReq.setHeader('x-bridge-context', JSON.stringify(req.bridgeContext));
  },
  onError: (err, req, res) => {
    console.error('[GATEWAY] SVG engine error:', err.message);
    res.status(503).json({ error: 'SVG engine unavailable' });
  }
}));

// =============================================
// BRIDGE-AWARE ENDPOINTS
// =============================================

// Health check (includes bridge metrics)
app.get('/health', async (req, res) => {
  try {
    const bridgeHealth = await axios.get(`${BRIDGE_SERVICE}/health`, { timeout: 3000 });
    res.json({
      status: 'healthy',
      service: 'gateway',
      side: SERVICE_SIDE,
      bridgeConnected: true,
      bridgeMetrics: bridgeHealth.data.metrics,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.json({
      status: 'healthy',
      service: 'gateway',
      side: SERVICE_SIDE,
      bridgeConnected: false,
      timestamp: new Date().toISOString()
    });
  }
});

// Status with sync state
app.get('/status', authenticateJWT, async (req, res) => {
  try {
    const session = await redisClient.get(`user:${req.user.id}:session`);
    const consistency = await axios.get(`${BRIDGE_SERVICE}/validate/${req.user.id}`, { timeout: 3000 }).catch(() => ({ data: { consistent: 'unknown' } }));

    res.json({
      gateway: 'running',
      side: SERVICE_SIDE,
      user: {
        id: req.user.id,
        bridgeAware: true,
        synced: session ? true : false,
        consistentAcrossSides: consistency.data.consistent
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Status check failed', details: err.message });
  }
});

// Explicit cross-side sync request
app.post('/sync', authenticateJWT, async (req, res) => {
  try {
    const syncResult = await axios.post(`${BRIDGE_SERVICE}/sync/user`, {
      userId: req.user.id,
      userData: req.body
    });

    res.json({
      success: true,
      message: 'User synced across sides',
      syncResult: syncResult.data,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Sync failed', details: err.message });
  }
});

// Force routing decision override
app.post('/route-override', authenticateJWT, async (req, res) => {
  const { forceSide } = req.body;

  if (!['this', 'other'].includes(forceSide)) {
    return res.status(400).json({ error: 'Invalid side' });
  }

  try {
    await redisClient.setEx(`user:${req.user.id}:forced_side`, 300, forceSide);
    res.json({
      success: true,
      userId: req.user.id,
      forcedSide: forceSide,
      durationSeconds: 300,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Override failed', details: err.message });
  }
});

// =============================================
// ERROR HANDLER
// =============================================

app.use((err, req, res, next) => {
  console.error(`[GATEWAY-${SERVICE_SIDE.toUpperCase()}] Error:`, err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    requestId: req.bridgeContext?.requestId
  });
});

// =============================================
// START SERVER
// =============================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║   BRIDGE GATEWAY (${SERVICE_SIDE.toUpperCase()})               ║`);
  console.log(`║   Port: ${PORT}                             ║`);
  console.log(`║   Bridge Service: ${BRIDGE_SERVICE.substring(0, 30)}... ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
});

module.exports = app;
