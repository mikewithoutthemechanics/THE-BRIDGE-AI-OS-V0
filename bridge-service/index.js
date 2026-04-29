// Bridge Service - Bidirectional Synchronization & Intelligent Routing
// Connects THIS SIDE ↔ OTHER SIDE
// Handles: state sync, failover, load balancing, request routing

const express = require('express');
const { EventEmitter } = require('events');
const redis = require('redis');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 9000;

// =============================================
// CONFIGURATION
// =============================================

const THIS_SIDE = {
  name: 'this',
  gateway: process.env.THIS_SIDE_GATEWAY || 'http://gateway:8080',
  brain: process.env.THIS_SIDE_BRAIN || 'http://brain:8000',
  main: process.env.THIS_SIDE_MAIN || 'http://main-service:3000'
};

const OTHER_SIDE = {
  name: 'other',
  gateway: process.env.OTHER_SIDE_GATEWAY || 'http://gateway-other:8080',
  brain: process.env.OTHER_SIDE_BRAIN || 'http://brain-other:8000',
  main: process.env.OTHER_SIDE_MAIN || 'http://main-service-other:3000'
};

// =============================================
// REDIS CLIENT (Shared state + event bus)
// =============================================

const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379',
  password: process.env.REDIS_PASS
});

const redisSubscriber = redis.createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379',
  password: process.env.REDIS_PASS
});

redisClient.on('connect', () => console.log('[BRIDGE] Redis connected (main)'));
redisSubscriber.on('connect', () => console.log('[BRIDGE] Redis connected (subscriber)'));

// =============================================
// BRIDGE EVENT EMITTER
// =============================================

const bridgeEvents = new EventEmitter();

// Subscribe to Redis events for state sync
redisSubscriber.subscribe('bridge:sync:user', 'bridge:sync:state', 'bridge:failover', (err, count) => {
  if (!err) console.log(`[BRIDGE] Subscribed to ${count} channels`);
});

redisSubscriber.on('message', (channel, message) => {
  console.log(`[BRIDGE] Event on ${channel}:`, message.substring(0, 100) + '...');
  bridgeEvents.emit(channel, JSON.parse(message));
});

// =============================================
// MIDDLEWARE
// =============================================

app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  req.bridgeContext = {
    requestId: crypto.randomUUID(),
    timestamp: Date.now(),
    originSide: req.headers['x-bridge-origin'] || 'unknown',
    targetSide: null
  };
  next();
});

// =============================================
// BRIDGE INTELLIGENCE ENGINE
// =============================================

class BridgeRouter {
  constructor() {
    this.sideMetrics = {
      this: { latency: 0, load: 0, errors: 0, healthy: true },
      other: { latency: 0, load: 0, errors: 0, healthy: true }
    };
    this.updateMetricsInterval = setInterval(() => this.updateMetrics(), 5000);
  }

  async updateMetrics() {
    try {
      const [thisHealth, otherHealth] = await Promise.allSettled([
        this.checkHealth(THIS_SIDE),
        this.checkHealth(OTHER_SIDE)
      ]);

      this.sideMetrics.this = thisHealth.value || { healthy: false, latency: 9999, load: 100 };
      this.sideMetrics.other = otherHealth.value || { healthy: false, latency: 9999, load: 100 };

      await redisClient.set('bridge:metrics', JSON.stringify(this.sideMetrics), {
        EX: 30
      });
    } catch (err) {
      console.error('[BRIDGE] Metrics update failed:', err.message);
    }
  }

  async checkHealth(side) {
    const start = Date.now();
    try {
      const response = await axios.get(`${side.gateway}/health`, { timeout: 5000 });
      const latency = Date.now() - start;
      return {
        healthy: response.status === 200,
        latency,
        load: response.data.load || 0,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      console.warn(`[BRIDGE] Health check failed for ${side.name}:`, err.message);
      return { healthy: false, latency: 9999, load: 100 };
    }
  }

  // DECISION ENGINE: Route based on latency, load, task type
  decideSide(taskType = 'general') {
    const thisMetrics = this.sideMetrics.this;
    const otherMetrics = this.sideMetrics.other;

    // If one side is down, use the healthy one
    if (!thisMetrics.healthy && otherMetrics.healthy) return 'other';
    if (!otherMetrics.healthy && thisMetrics.healthy) return 'this';

    // Task-based routing
    switch (taskType) {
      case 'compute':
        // Heavy compute → OTHER SIDE (execution plane)
        return otherMetrics.healthy ? 'other' : 'this';
      case 'ui':
        // Real-time UX → THIS SIDE (control plane)
        return thisMetrics.healthy ? 'this' : 'other';
      case 'verify':
        // Verification/KYC → OTHER SIDE (isolated compute)
        return otherMetrics.healthy ? 'other' : 'this';
      default:
        // Load-balanced decision
        const thisScore = thisMetrics.latency + thisMetrics.load * 10;
        const otherScore = otherMetrics.latency + otherMetrics.load * 10;
        return thisScore < otherScore ? 'this' : 'other';
    }
  }

  getSideURL(side) {
    return side === 'this' ? THIS_SIDE : OTHER_SIDE;
  }
}

const router = new BridgeRouter();

// =============================================
// SYNC ENGINE: User & State Replication
// =============================================

class SyncEngine {
  async syncUser(userId, userData) {
    const syncKey = `bridge:sync:user:${userId}`;
    const timestamp = Date.now();

    try {
      // Publish sync event
      await redisClient.publish('bridge:sync:user', JSON.stringify({
        userId,
        userData,
        timestamp,
        source: 'bridge'
      }));

      // Store sync metadata
      await redisClient.hSet(syncKey, 'lastSync', timestamp.toString(), 'status', 'synced');
      await redisClient.expire(syncKey, 86400); // 24h TTL

      console.log(`[BRIDGE] User ${userId} synced`);
      return { success: true, timestamp };
    } catch (err) {
      console.error('[BRIDGE] Sync failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  async syncState(stateType, stateData) {
    const syncKey = `bridge:sync:state:${stateType}`;
    const timestamp = Date.now();

    try {
      await redisClient.publish('bridge:sync:state', JSON.stringify({
        stateType,
        stateData,
        timestamp,
        source: 'bridge'
      }));

      await redisClient.set(syncKey, JSON.stringify(stateData), {
        EX: 3600 // 1h TTL
      });

      console.log(`[BRIDGE] State ${stateType} synced`);
      return { success: true, timestamp };
    } catch (err) {
      console.error('[BRIDGE] State sync failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  async validateConsistency(userId) {
    try {
      const thisUser = await axios.get(`${THIS_SIDE.main}/user/${userId}`, { timeout: 3000 });
      const otherUser = await axios.get(`${OTHER_SIDE.main}/user/${userId}`, { timeout: 3000 });

      const consistent = JSON.stringify(thisUser.data) === JSON.stringify(otherUser.data);
      return { consistent, thisTimestamp: thisUser.data.updatedAt, otherTimestamp: otherUser.data.updatedAt };
    } catch (err) {
      console.error('[BRIDGE] Consistency check failed:', err.message);
      return { consistent: false, error: err.message };
    }
  }
}

const syncEngine = new SyncEngine();

// =============================================
// FAILOVER ENGINE
// =============================================

class FailoverEngine {
  async detectFailure(side) {
    try {
      const health = await router.checkHealth(router.getSideURL(side));
      return !health.healthy;
    } catch (err) {
      return true;
    }
  }

  async executeFailover(fromSide, toSide) {
    console.log(`[BRIDGE] FAILOVER: ${fromSide} → ${toSide}`);

    try {
      // Publish failover event
      await redisClient.publish('bridge:failover', JSON.stringify({
        fromSide,
        toSide,
        timestamp: Date.now(),
        initiator: 'bridge'
      }));

      // Update routing policy
      await redisClient.set('bridge:active_side', toSide, { EX: 300 });

      return { success: true, fromSide, toSide, timestamp: Date.now() };
    } catch (err) {
      console.error('[BRIDGE] Failover failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  async recoverFailedSide(side) {
    console.log(`[BRIDGE] Recovery attempt for ${side}`);
    // In production: trigger container restart, health checks, gradual traffic shift
    return { success: true, side, timestamp: Date.now() };
  }
}

const failover = new FailoverEngine();

// =============================================
// ROUTES: BRIDGE OPERATIONS
// =============================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'bridge',
    metrics: router.sideMetrics,
    timestamp: new Date().toISOString()
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    sides: router.sideMetrics,
    timestamp: new Date().toISOString()
  });
});

// Intelligent routing endpoint
app.post('/route', (req, res) => {
  const { taskType, userId } = req.body;
  const decidedSide = router.decideSide(taskType);
  const targetURL = router.getSideURL(decidedSide);

  res.json({
    requestId: req.bridgeContext.requestId,
    decidedSide,
    taskType,
    targetURL,
    reason: `Routed to ${decidedSide} based on ${taskType} task type and metrics`,
    metrics: router.sideMetrics,
    timestamp: new Date().toISOString()
  });
});

// User sync endpoint
app.post('/sync/user', async (req, res) => {
  const { userId, userData } = req.body;
  const result = await syncEngine.syncUser(userId, userData);
  res.json(result);
});

// State sync endpoint
app.post('/sync/state', async (req, res) => {
  const { stateType, stateData } = req.body;
  const result = await syncEngine.syncState(stateType, stateData);
  res.json(result);
});

// Consistency check
app.get('/validate/:userId', async (req, res) => {
  const result = await syncEngine.validateConsistency(req.params.userId);
  res.json(result);
});

// Failover trigger
app.post('/failover', async (req, res) => {
  const { fromSide, toSide } = req.body;
  const result = await failover.executeFailover(fromSide, toSide);
  res.json(result);
});

// =============================================
// REQUEST FORWARDING: Dual-side execution
// =============================================

app.post('/forward', async (req, res) => {
  const { path, method = 'POST', body, taskType } = req.body;
  const decidedSide = router.decideSide(taskType);
  const targetURL = router.getSideURL(decidedSide);

  try {
    const response = await axios({
      method,
      url: `${targetURL.gateway}${path}`,
      data: body,
      timeout: 10000,
      headers: {
        'x-bridge-origin': 'bridge-service',
        'x-request-id': req.bridgeContext.requestId
      }
    });

    res.json({
      success: true,
      side: decidedSide,
      data: response.data,
      requestId: req.bridgeContext.requestId
    });
  } catch (err) {
    console.error(`[BRIDGE] Forward to ${decidedSide} failed:`, err.message);
    res.status(502).json({
      success: false,
      error: err.message,
      failedSide: decidedSide,
      requestId: req.bridgeContext.requestId
    });
  }
});

// =============================================
// START SERVICE
// =============================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║   BRIDGE SERVICE INITIALIZED            ║`);
  console.log(`║   Port: ${PORT}                             ║`);
  console.log(`║   Mode: Bidirectional Sync + Routing    ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
  console.log(`[BRIDGE] THIS SIDE:  ${THIS_SIDE.gateway}`);
  console.log(`[BRIDGE] OTHER SIDE: ${OTHER_SIDE.gateway}\n`);

  router.updateMetrics();
});

module.exports = app;
