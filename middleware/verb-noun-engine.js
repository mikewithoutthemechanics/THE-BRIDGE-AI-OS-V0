/**
 * VERB–NOUN ENGINE
 * 
 * A Language-Based Execution Layer for the REST API
 * 
 * Core Principle: VERB + NOUN = EXECUTABLE INTENT
 * 
 * This transforms the API from route-based to language-driven,
 * enabling semantic RBAC, composable operations, and cognitive execution.
 */

const { randomUUID: uuidv4 } = require('crypto');

// ═══════════════════════════════════════════════════════════════
// CANONICAL VERB SET (SYSTEM-WIDE)
// ═══════════════════════════════════════════════════════════════
const VERBS = {
  READ: 'READ',        // safe retrieval, no state mutation
  WRITE: 'WRITE',      // state mutation, data modification
  EXECUTE: 'EXECUTE',  // triggers computation / agents / workflows
  ANALYZE: 'ANALYZE',  // intelligence, aggregation, reporting
  CONTROL: 'CONTROL'  // system-level authority, configuration
};

// HTTP method to verb mapping
const VERB_MAP = {
  GET: 'READ',
  POST: 'WRITE',
  PUT: 'WRITE',
  PATCH: 'WRITE',
  DELETE: 'CONTROL'
};

// ═══════════════════════════════════════════════════════════════
// CANONICAL NOUN DOMAINS
// ═══════════════════════════════════════════════════════════════
const NOUNS = {
  BANK: 'BANK',
  TREASURY: 'TREASURY',
  LEDGER: 'LEDGER',
  CREDITS: 'CREDITS',
  AGENT: 'AGENT',
  USER: 'USER',
  SUBSCRIPTION: 'SUBSCRIPTION',
  MAIL: 'MAIL',
  WORDPRESS: 'WORDPRESS',
  SYSTEM: 'SYSTEM',
  FOUNDER: 'FOUNDER',
  EMAIL: 'EMAIL',
  REVENUE: 'REVENUE',
  ECONOMY: 'ECONOMY',
  AUTH: 'AUTH',
  NOTION: 'NOTION',
  LEADGEN: 'LEADGEN'
};

// ═══════════════════════════════════════════════════════════════
// SEMANTIC RBAC POLICY MATRIX
// ═══════════════════════════════════════════════════════════════
// Role hierarchy: PUBLIC < CLIENT < ADMIN < SUPERADMIN
const POLICY = {
  TREASURY: {
    READ: 'SUPERADMIN',
    WRITE: 'SUPERADMIN',
    EXECUTE: 'SUPERADMIN',
    ANALYZE: 'SUPERADMIN',
    CONTROL: 'SUPERADMIN'
  },
  BANK: {
    READ: 'ADMIN',
    WRITE: 'ADMIN',
    EXECUTE: 'ADMIN',
    ANALYZE: 'ADMIN',
    CONTROL: 'SUPERADMIN'
  },
  LEDGER: {
    READ: 'ADMIN',
    WRITE: 'ADMIN',
    ANALYZE: 'ADMIN'
  },
  CREDITS: {
    READ: 'CLIENT',
    WRITE: 'ADMIN',
    ANALYZE: 'ADMIN'
  },
  AGENT: {
    READ: 'CLIENT',
    EXECUTE: 'CLIENT',
    ANALYZE: 'ADMIN'
  },
  USER: {
    READ: 'ADMIN',
    WRITE: 'ADMIN',
    CONTROL: 'SUPERADMIN'
  },
  SUBSCRIPTION: {
    READ: 'ADMIN',
    ANALYZE: 'ADMIN',
    CONTROL: 'ADMIN'
  },
  MAIL: {
    READ: 'ADMIN',
    WRITE: 'ADMIN',
    EXECUTE: 'ADMIN',
    ANALYZE: 'ADMIN'
  },
  WORDPRESS: {
    READ: 'ADMIN',
    WRITE: 'ADMIN',
    EXECUTE: 'ADMIN',
    CONTROL: 'ADMIN'
  },
  EMAIL: {
    READ: 'ADMIN',
    WRITE: 'ADMIN',
    CONTROL: 'ADMIN'
  },
  FOUNDER: {
    READ: 'ADMIN',
    WRITE: 'ADMIN',
    CONTROL: 'ADMIN'
  },
  REVENUE: {
    READ: 'ADMIN',
    ANALYZE: 'ADMIN'
  },
  ECONOMY: {
    READ: 'CLIENT',
    WRITE: 'CLIENT',
    EXECUTE: 'ADMIN',
    ANALYZE: 'ADMIN'
  },
  AUTH: {
    READ: 'ADMIN',
    WRITE: 'PUBLIC',
    CONTROL: 'ADMIN'
  },
  NOTION: {
    READ: 'ADMIN',
    WRITE: 'ADMIN',
    CONTROL: 'ADMIN'
  },
  LEADGEN: {
    EXECUTE: 'ADMIN'
  },
  SYSTEM: {
    READ: 'ADMIN',
    CONTROL: 'SUPERADMIN'
  }
};

// ═══════════════════════════════════════════════════════════════
// ROLE HIERARCHY CHECKER
// ═══════════════════════════════════════════════════════════════
const ROLE_LEVELS = {
  PUBLIC: 0,
  CLIENT: 1,
  ADMIN: 2,
  SUPERADMIN: 3
};

function hasRequiredRole(userRole, requiredRole) {
  const userLevel = ROLE_LEVELS[userRole] || ROLE_LEVELS.PUBLIC;
  const requiredLevel = ROLE_LEVELS[requiredRole] || ROLE_LEVELS.SUPERADMIN;
  return userLevel >= requiredLevel;
}

// ═══════════════════════════════════════════════════════════════
// INTENT RESOLVER
// ═══════════════════════════════════════════════════════════════
function resolveIntent(req) {
  const method = req.method.toUpperCase();
  const verb = VERB_MAP[method] || 'READ';
  
  // Extract noun from path: /api/banks → BANK (middleware mounted at /api so path is relative)
  const pathParts = req.path.split('/').filter(Boolean);
  // pathParts[0] is the resource (banks), pathParts[1] is sub-resource
  let noun = (pathParts[0] || '').toUpperCase();

  // Handle sub-resources: /api/banks/compound → BANK.COMPOUND
  if (pathParts[1]) {
    noun = `${noun}.${pathParts[1].toUpperCase()}`;
  }

  // Map to canonical noun (guard against empty noun)
  const canonicalNoun = noun
    ? (Object.values(NOUNS).find(n => noun.startsWith(n)) || noun)
    : 'UNKNOWN';
  
  return {
    verb,
    noun: canonicalNoun,
    originalPath: req.path,
    method
  };
}

// ═══════════════════════════════════════════════════════════════
// POLICY ENFORCEMENT
// ═══════════════════════════════════════════════════════════════
function enforcePolicy(verb, noun, userRole) {
  // Get base noun (remove sub-resource)
  const baseNoun = noun.split('.')[0];
  
  const nounPolicy = POLICY[baseNoun];
  if (!nounPolicy) {
    // Default to ADMIN for unknown nouns
    return hasRequiredRole(userRole, 'ADMIN');
  }
  
  const requiredRole = nounPolicy[verb];
  if (!requiredRole) {
    // Default to ADMIN for undefined verb-noun combinations
    return hasRequiredRole(userRole, 'ADMIN');
  }
  
  return hasRequiredRole(userRole, requiredRole);
}

// ═══════════════════════════════════════════════════════════════
// INTENT MIDDLEWARE
// ═══════════════════════════════════════════════════════════════
function intentMiddleware(req, res, next) {
  const intent = resolveIntent(req);
  req.intent = intent;
  req.traceId = uuidv4();
  
  // Attach intent to response for logging
  res.setHeader('X-Trace-Id', req.traceId);
  res.setHeader('X-Intent', `${intent.verb} ${intent.noun}`);
  
  next();
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC ENDPOINT EXEMPTIONS
// ═══════════════════════════════════════════════════════════════
// These endpoints bypass semantic RBAC and use their own auth logic
const PUBLIC_ENDPOINTS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/wp-login',
  '/api/auth/wp-plugin',
  '/referral/claim',
  '/auth/register',
  '/auth/login'
]);

// ═══════════════════════════════════════════════════════════════
// SEMANTIC RBAC MIDDLEWARE
// ═══════════════════════════════════════════════════════════════
function semanticRBAC(req, res, next) {
  // Exempt public endpoints from semantic RBAC
  if (PUBLIC_ENDPOINTS.has(req.path)) {
    return next();
  }
  
  const { verb, noun } = req.intent;
  const userRole = req.user?.role || 'PUBLIC';
  
  const authorized = enforcePolicy(verb, noun, userRole);
  
  if (!authorized) {
    const baseNoun = noun.split('.')[0];
    const nounPolicy = POLICY[baseNoun];
    const requiredRole = nounPolicy?.[verb] || 'ADMIN';
    
    return res.status(403).json({
      error: 'FORBIDDEN',
      intent: `${verb} ${noun}`,
      actor: userRole,
      required: requiredRole,
      traceId: req.traceId
    });
  }
  
  next();
}

// ═══════════════════════════════════════════════════════════════
// EXECUTION RESPONSE WRAPPER (OPTIONAL)
// ═══════════════════════════════════════════════════════════════
// Only wraps responses if X-Wrap-Execution header is set
function wrapExecution(req, res, next) {
  const originalJson = res.json;
  const startTime = Date.now();
  
  res.json = function(data) {
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    // Only wrap if header is set (for telemetry/overseer)
    if (req.headers['x-wrap-execution'] === 'true') {
      const wrapped = {
        intent: `${req.intent.verb} ${req.intent.noun}`,
        actor: req.user?.role || 'PUBLIC',
        status: res.statusCode < 400 ? 'AUTHORIZED' : 'UNAUTHORIZED',
        execution: res.statusCode < 400 ? 'SUCCESS' : 'FAILURE',
        traceId: req.traceId,
        latency,
        data
      };
      
      originalJson.call(this, wrapped);
    } else {
      // Return original response
      originalJson.call(this, data);
    }
  };
  
  next();
}

// ═══════════════════════════════════════════════════════════════
// INTENT TELEMETRY LOGGER
// ═══════════════════════════════════════════════════════════════
// In-memory intent log for overseer/telemetry (replace with Redis/DB in production)
const intentLog = new Map();
const MAX_LOG_ENTRIES = 10000;
const OVERSEER_URL = process.env.OVERSEER_URL || 'http://localhost:9091';
const ENABLE_OVERSEER_INTEGRATION = process.env.ENABLE_OVERSEER_INTEGRATION !== 'false';

function logIntent(req, res, next) {
  const startTime = Date.now();
  
  // Capture original end to log on response completion
  const originalEnd = res.end;
  res.end = function(...args) {
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    const logEntry = {
      intent: `${req.intent.verb} ${req.intent.noun}`,
      actor: req.user?.role || 'PUBLIC',
      status: res.statusCode < 400 ? 'AUTHORIZED' : 'UNAUTHORIZED',
      execution: res.statusCode < 400 ? 'SUCCESS' : 'FAILURE',
      traceId: req.traceId,
      latency,
      statusCode: res.statusCode,
      path: req.originalPath,
      method: req.method,
      timestamp: new Date().toISOString()
    };
    
    // Store in memory log (circular buffer)
    const logKey = `${Date.now()}_${req.traceId}`;
    intentLog.set(logKey, logEntry);
    
    // Maintain max size
    if (intentLog.size > MAX_LOG_ENTRIES) {
      const oldestKey = intentLog.keys().next().value;
      intentLog.delete(oldestKey);
    }
    
    // Send event to Overseer for pattern learning and telemetry
    if (ENABLE_OVERSEER_INTEGRATION) {
      sendToOverseer({
        type: 'INTENT_EXECUTION',
        ...logEntry
      }).catch(err => {
        // Silent failure - don't break the request if overseer is unavailable
        console.error('[VERB-NOUN] Failed to send intent to overseer:', err.message);
      });
    }
    
    originalEnd.apply(this, args);
  };
  
  next();
}

async function sendToOverseer(event) {
  try {
    const http = require('http');
    const data = JSON.stringify(event);
    
    return new Promise((resolve, reject) => {
      const url = new URL(OVERSEER_URL);
      const options = {
        hostname: url.hostname,
        port: url.port || 9091,
        path: '/event',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };
      
      const req = http.request(options, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Overseer returned status ${res.statusCode}`));
        }
      });
      
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  } catch (err) {
    throw err;
  }
}

function getIntentLog(limit = 100) {
  const entries = Array.from(intentLog.values())
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
  return entries;
}

function getIntentLogByTrace(traceId) {
  for (const entry of intentLog.values()) {
    if (entry.traceId === traceId) return entry;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════
module.exports = {
  VERBS,
  NOUNS,
  POLICY,
  resolveIntent,
  enforcePolicy,
  intentMiddleware,
  semanticRBAC,
  wrapExecution,
  hasRequiredRole,
  logIntent,
  getIntentLog,
  getIntentLogByTrace
};
