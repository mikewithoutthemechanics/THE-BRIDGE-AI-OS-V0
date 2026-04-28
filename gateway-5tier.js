// Updated gateway.js for 5-tier architecture
// Routes requests to appropriate microservices

const express = require('express');
const { Router } = express;
const redis = require('redis');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 8080;

// ============================================
// MIDDLEWARE
// ============================================

// Security
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});
app.use(limiter);

// ============================================
// REDIS CONNECTION
// ============================================
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  password: process.env.REDIS_PASS,
  retry_strategy: (options) => {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      console.warn('[GATEWAY] Redis connection refused');
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
      return new Error('Redis connection timeout');
    }
    return Math.min(options.attempt * 100, 3000);
  }
});

redisClient.on('error', (err) => console.error('[GATEWAY] Redis error:', err));
redisClient.on('connect', () => console.log('[GATEWAY] Redis connected'));

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================
const authenticateJWT = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token', details: err.message });
  }
};

// ============================================
// SERVICE ROUTING
// ============================================

// Main service (Tier 3A) - core API
app.use('/api/agent', createProxyMiddleware({
  target: process.env.MAIN_SERVICE_URL || 'http://localhost:3000',
  changeOrigin: true,
  pathRewrite: { '^/api': '' },
  onError: (err, req, res) => {
    console.error('[GATEWAY] Main service error:', err.message);
    res.status(503).json({ error: 'Main service unavailable' });
  }
}));

// Brain service (Tier 3B) - AI queries
app.use('/brain', createProxyMiddleware({
  target: process.env.BRAIN_SERVICE_URL || 'http://localhost:8000',
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error('[GATEWAY] Brain service error:', err.message);
    res.status(503).json({ error: 'Brain service unavailable' });
  }
}));

// SVG engine (Tier 3C) - visualization
app.use('/svg', createProxyMiddleware({
  target: process.env.SVG_SERVICE_URL || 'http://localhost:7070',
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error('[GATEWAY] SVG engine error:', err.message);
    res.status(503).json({ error: 'SVG engine unavailable' });
  }
}));

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============================================
// STATUS ENDPOINT
// ============================================
app.get('/status', authenticateJWT, (req, res) => {
  res.status(200).json({
    gateway: 'running',
    redis: redisClient.connected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
  console.error('[GATEWAY] Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[GATEWAY] Server running on port ${PORT}`);
  console.log(`[GATEWAY] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[GATEWAY] Main Service: ${process.env.MAIN_SERVICE_URL || 'http://localhost:3000'}`);
  console.log(`[GATEWAY] Brain Service: ${process.env.BRAIN_SERVICE_URL || 'http://localhost:8000'}`);
  console.log(`[GATEWAY] SVG Engine: ${process.env.SVG_SERVICE_URL || 'http://localhost:7070'}`);
});

module.exports = app;
