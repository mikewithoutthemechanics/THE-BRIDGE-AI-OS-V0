# Documentation Pages - Complete Set

---

# Table of Contents

## Backend Section
- [API Gateway & Router](#backend)
  - [API Gateway Architecture](#api-gateway-architecture)
  - [API Endpoints Reference](#api-endpoints-reference)
- [Data Models & Schemas](#data-models)
- [Security & Authentication](#security)
  - [Authentication Middleware](#authentication-middleware)
  - [API Key Authentication](#api-key-authentication)
  - [Access Control](#access-control)
- [Persistence Layer](#persistence)
  - [Database Configuration](#database-configuration)
  - [Supabase Integration](#supabase-integration)
- [Business Logic Services](#services)

## Middleware Section
- [Request Handling](#middleware-request)
- [Routing](#middleware-routing)
- [Logging & Monitoring](#middleware-logging)
- [Error Handling](#middleware-error)
- [Caching](#middleware-cache)

## Frontend Section
- [Components](#frontend-components)
- [State Management](#frontend-state)
- [Routing](#frontend-routing)
- [Testing](#frontend-testing)

---

# BACKEND DOCUMENTATION

---

## API Gateway Architecture

```yaml
---
title: API Gateway Architecture
slug: backend/api-gateway
audience: Backend Developers, DevOps Engineers
summary: Comprehensive guide to the unified API gateway that handles all HTTP requests including /api/*, /health, /orchestrator/*, /billing, /ask, /auth/*, and /referral/*
prerequisites:
  - Node.js 18+
  - Express.js 5.x
  - Understanding of RESTful APIs
topics:
  - API Gateway
  - Request Routing
  - Serverless Functions
  - Vercel Integration
keywords:
  - API Gateway
  - Express Router
  - Serverless
  - Vercel
dependencies:
  - express
  - axios
  - jsonwebtoken
author: System Architecture Team
version: 2.0
last_updated: 2026-04-15
---

# API Gateway Architecture

## Overview

The API Gateway serves as the single entry point for all client requests in the AoE Unified system. It implements a unified Express.js application with Vercel serverless function integration, handling approximately 45% of operations traffic, 15% growth, 15% reserve, and 25% founder bucket allocations.

## Key Concepts

### Request Flow
1. Client sends HTTP request to `/api/*`, `/health`, `/orchestrator/*`, `/billing`, `/ask`, `/auth/*`, or `/referral/*`
2. Gateway validates authentication tokens
3. Request is routed to appropriate handler based on path
4. Handler processes request and returns response
5. Response is logged and metrics are updated

### Bucket Allocation System
- **Operations (ops)**: 45% - Core system maintenance, monitoring, health checks
- **Growth**: 15% - Lead generation, marketing, user acquisition
- **Reserve**: 15% - Emergency fallback, circuit breakers
- **Founder**: 25% - Premium features, admin operations

### TVM (Topology Visibility Matrix)
The gateway includes a built-in TVM system that monitors system health across 15 topics:
- MailPipeline, TreasuryAPI, GlobalMapSync, WordPressSync
- VPSGateway, BrainOrchestrator, AgentSwarm, AuthService
- SkillsEngine, UBIPool, LeadGen, PaymentGateway
- BrainVPSSSH, SubdomainSSL, WebwayDNS

## APIs & Endpoints

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | System health check |
| POST | `/api/agents/dispatch` | Dispatch agent action |
| GET | `/orchestrator/status` | Orchestrator status |
| POST | `/billing/*` | Billing operations |
| GET | `/ask` | AI query handler |
| POST | `/auth/*` | Authentication |
| GET | `/referral/*` | Referral management |

### TVM Endpoints

```javascript
// Get full system matrix
GET /api/tvm/matrix

// Get TVM summary
GET /api/tvm/summary

// Get specific topic status
GET /api/tvm/topic/:name

// Approve action
POST /api/tvm/approve
{ topic: "VPSGateway", action: "approve" }

// Propose new recommendation
POST /api/tvm/propose
{ topic: "AgentSwarm", code: "SW-REBALANCE", justification: "utilization drift" }
```

## Data Models

### TVM Row Schema

```typescript
interface TVMRow {
  topic: string;
  configured: number;      // 0 = not configured, 1 = configured
  healthy: number;        // 0 = unhealthy, 1 = healthy
  degraded: number;        // 0 = not degraded, 1 = degraded
  action_required: number; // 0 = no action, 1 = action needed
  autofix_available: number;
  human_approval_needed: number;
  last_updated: number;   // Unix timestamp
  recommendation_code: string;
  risk_score: number;     // 1-5 scale
  priority: number;       // 1-3 scale
  owner: string;          // ops, brain, growth, treasury
  signature: string;      // HMAC-SHA256 signature
}
```

### Recommendation Codes

| Code | Description | Severity | Type |
|------|-------------|----------|------|
| MP-AF-ROTATE-TOKEN | Rotate SMTP/Brevo token | 3 | autofix |
| TR-RECONCILE | Treasury reconciliation | 4 | autofix |
| VPS-RESTART-GW | Restart VPS gateway | 4 | autofix |
| AUTH-ROTATE-JWT | Rotate JWT keys | 4 | security |
| OK | System healthy | 0 | none |

## Workflows

### Request Processing Flow
```
Client Request
     ↓
Authentication Check
     ↓
Bucket Allocation Check
     ↓
Route Handler Match
     ↓
Execute Handler
     ↓
Log & Metrics Update
     ↓
Response
```

### Health Check Flow
```
GET /api/health
     ↓
Check TVM Matrix
     ↓
Verify critical services
     ↓
Return status + recommendations
```

## Code Examples

### Basic Gateway Setup

```javascript
const express = require('express');
const app = express();

// Health endpoint
app.get('/api/health', (req, res) => {
  const tvmSummary = tvm.getSummary();
  res.json({
    status: tvmSummary.healthy === tvmSummary.total ? 'healthy' : 'degraded',
    timestamp: Date.now(),
    summary: tvmSummary,
    recommendations: getActiveRecommendations()
  });
});

// API catch-all for serverless
app.use('/api', apiRouter);
app.use('/auth', authRouter);
app.use('/billing', billingRouter);

module.exports = app;
```

### TVM Integration

```javascript
const { tvm } = require('./tvm');

// Get system status
app.get('/api/system/status', (req, res) => {
  const matrix = tvm.getMatrix();
  const summary = tvm.getSummary();
  
  res.json({
    matrix,
    summary,
    topology: _TVM_TOPOLOGY,
    version: '1.0'
  });
});

// Approve action endpoint
app.post('/api/tvm/approve', requireAuth, (req, res) => {
  const { topic } = req.body;
  const result = tvm.approveAction(topic);
  res.json(result);
});
```

## Best Practices

1. **Always validate bucket allocation** before processing requests
2. **Use HMAC signing** for TVM to prevent tampering
3. **Implement circuit breakers** for degraded services
4. **Log all recommendations** with severity levels
5. **Require human approval** for high-severity actions (4-5)
6. **Monitor TVM metrics** for proactive maintenance

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Gateway timeout | Check TVM for degraded services, restart affected components |
| Authentication failures | Verify JWT_SECRET, check token expiration |
| Route not found | Ensure Express router is properly configured |
| TVM stale data | Check last_updated timestamp, force refresh |

### Health Check Response Codes

- `200`: All systems operational
- `207`: Multi-status (some services degraded)
- `503`: Critical service down

## Related Pages

- [API Endpoints Reference](backend/api-endpoints)
- [Authentication Middleware](middleware/auth)
- [Database Configuration](backend/database)
- [Monitoring & Logging](middleware/logging)

---

## API Endpoints Reference

```yaml
---
title: API Endpoints Reference
slug: backend/api-endpoints
audience: Backend Developers, Frontend Developers
summary: Complete reference of all API endpoints including request/response formats, authentication requirements, and error codes
prerequisites:
  - REST API fundamentals
  - JSON data formats
  - HTTP status codes
topics:
  - REST API Design
  - Request/Response Patterns
  - Error Handling
  - Rate Limiting
keywords:
  - REST API
  - Endpoints
  - HTTP Methods
  - Authentication
author: API Team
version: 2.0
last_updated: 2026-04-15
---

# API Endpoints Reference

## Overview

This document provides a complete reference for all API endpoints in the AoE Unified system. All endpoints follow RESTful conventions and return JSON responses.

## Base Configuration

- **Base URL**: `https://api.aoe-unified.com` (production)
- **Local**: `http://localhost:3000` (development)
- **Content-Type**: `application/json`

## Endpoint Categories

### 1. Health & Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Main health check |
| GET | `/api/health/detailed` | Detailed system status |
| GET | `/api/tvm/matrix` | Topology visibility matrix |
| GET | `/api/tvm/summary` | TVM summary |
| GET | `/api/metrics` | System metrics |

### 2. Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | User login |
| POST | `/auth/logout` | User logout |
| POST | `/auth/refresh` | Refresh token |
| POST | `/auth/verify` | Verify token |
| GET | `/auth/profile` | Get user profile |

### 3. Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/agents/dispatch` | Dispatch agent action |
| GET | `/api/agents/list` | List all agents |
| GET | `/api/agents/:id` | Get agent details |
| POST | `/api/agents/create` | Create new agent |
| PUT | `/api/agents/:id` | Update agent |
| DELETE | `/api/agents/:id` | Delete agent |
| GET | `/api/swarm/health` | Swarm health |
| POST | `/api/swarm/rebalance` | Rebalance swarm |

### 4. Billing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/billing/subscriptions` | List subscriptions |
| POST | `/billing/subscribe` | Create subscription |
| PUT | `/billing/subscription/:id` | Update subscription |
| DELETE | `/billing/subscription/:id` | Cancel subscription |
| GET | `/billing/invoices` | List invoices |
| POST | `/billing/payment` | Process payment |

### 5. Treasury

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/treasury/status` | Treasury status |
| POST | `/api/treasury/reconcile` | Reconcile treasury |
| GET | `/api/treasury/balance` | Get balance |
| POST | `/api/treasury/withdraw` | Withdraw funds |
| GET | `/api/treasury/transactions` | Transaction history |

### 6. Marketplace

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/marketplace/listings` | List marketplace items |
| GET | `/api/marketplace/:id` | Get listing details |
| POST | `/api/marketplace/create` | Create listing |
| PUT | `/api/marketplace/:id` | Update listing |
| DELETE | `/api/marketplace/:id` | Delete listing |

## Request/Response Formats

### Authentication Request

```json
// POST /auth/login
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

### Authentication Response

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600,
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "role": "member"
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Invalid email or password",
    "details": {}
  }
}
```

### Paginated Response

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "hasMore": true
  }
}
```

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 429 | Too Many Requests |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

## Rate Limiting

- **Default**: 100 requests per minute
- **Authenticated**: 1000 requests per minute
- **Premium**: 5000 requests per minute

## Best Practices

1. Always check `success` field in responses
2. Handle error responses gracefully
3. Use pagination for list endpoints
4. Implement retry with exponential backoff
5. Cache responses where appropriate

## Related Pages

- [API Gateway Architecture](backend/api-gateway)
- [Authentication Middleware](middleware/auth)
- [Error Handling](middleware/error-handling)

---

## Database Configuration

```yaml
---
title: Database Configuration
slug: backend/database
audience: Backend Developers, DevOps Engineers
summary: Guide to database setup including SQLite for local development, PostgreSQL for production, and Supabase integration
prerequisites:
  - Node.js 18+
  - Basic SQL knowledge
  - Environment configuration
topics:
  - SQLite Setup
  - PostgreSQL Configuration
  - Supabase Integration
  - Database Migrations
keywords:
  - Database
  - SQLite
  - PostgreSQL
  - Supabase
  - Migrations
dependencies:
  - better-sqlite3
  - pg
  - @supabase/supabase-js
author: Database Team
version: 2.0
last_updated: 2026-04-15
---

# Database Configuration

## Overview

The AoE Unified system supports multiple database backends:
- **SQLite**: Local development and testing
- **PostgreSQL**: Production workloads
- **Supabase**: Cloud backend with real-time subscriptions

## Key Concepts

### Connection Priority
1. Check for Supabase URL first
2. Fall back to PostgreSQL connection string
3. Default to SQLite for development

### Schema Management
- All schemas defined in `/db` directory
- Migrations applied automatically on startup
- Seed data loaded for development

## Configuration

### Environment Variables

```bash
# Supabase (Primary)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# PostgreSQL (Fallback)
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# SQLite (Development)
DB_PATH=./data/aoe-unified.db
```

### Configuration File

```javascript
// lib/db.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

module.exports = { supabase };
```

## Data Models

### Core Tables

```sql
-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'member',
  created_at INTEGER,
  updated_at INTEGER
);

-- Agents table
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'idle',
  config JSON,
  created_at INTEGER
);

-- Tasks table
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id),
  status TEXT DEFAULT 'pending',
  input JSON,
  output JSON,
  created_at INTEGER,
  completed_at INTEGER
);

-- Transactions table
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  type TEXT NOT NULL,
  amount REAL,
  status TEXT DEFAULT 'pending',
  created_at INTEGER
);
```

## Supabase Integration

```javascript
// Supabase client setup
const supabase = require('./lib/supabase');

// Query users
const { data, error } = await supabase
  .from('users')
  .select('*')
  .eq('role', 'member');

// Insert new user
const { data, error } = await supabase
  .from('users')
  .insert([
    { 
      id: 'user_' + Date.now(),
      email: 'new@example.com',
      name: 'New User',
      role: 'member'
    }
  ]);

// Real-time subscription
const channel = supabase
  .channel('tasks')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, 
    (payload) => console.log('Task change:', payload)
  )
  .subscribe();
```

## SQLite for Development

```javascript
// Local SQLite setup
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/aoe-unified.db');
const db = new Database(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT,
    role TEXT DEFAULT 'member',
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
`);

module.exports = db;
```

## Migrations

### Migration Structure

```javascript
// migrations/001_initial_schema.js
exports.up = (db) => {
  db.createTable('users', (t) => {
    t.text('id').primary();
    t.text('email').unique();
    t.text('name');
    t.text('role').defaultTo('member');
    t.integer('created_at');
    t.integer('updated_at');
  });
  
  db.createTable('agents', (t) => {
    t.text('id').primary();
    t.text('name');
    t.text('type');
    t.text('status').defaultTo('idle');
    t.json('config');
    t.integer('created_at');
  });
};

exports.down = (db) => {
  db.dropTable('agents');
  db.dropTable('users');
};
```

## Best Practices

1. **Use prepared statements** to prevent SQL injection
2. **Implement connection pooling** for PostgreSQL
3. **Enable query logging** in development
4. **Use transactions** for multi-step operations
5. **Handle connection failures** gracefully

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection timeout | Check DATABASE_URL, increase timeout |
| Supabase auth error | Verify SUPABASE_ANON_KEY |
| Migration failed | Check table exists, use --force |
| Query slow | Add indexes, optimize joins |

## Related Pages

- [Supabase Integration](backend/supabase)
- [API Endpoints](backend/api-endpoints)
- [Data Models](backend/data-models)

---

## Authentication Middleware

```yaml
---
title: Authentication Middleware
slug: middleware/auth
audience: Backend Developers
summary: Implementation of JWT-based authentication with role-based access control, token validation, and session management
prerequisites:
  - Express.js middleware
  - JWT tokens
  - User roles and permissions
topics:
  - JWT Authentication
  - Token Validation
  - Role-Based Access Control
  - Session Management
keywords:
  - Authentication
  - JWT
  - Middleware
  - RBAC
dependencies:
  - jsonwebtoken
  - bcryptjs
author: Security Team
version: 2.0
last_updated: 2026-04-15
---

# Authentication Middleware

## Overview

The authentication middleware provides secure request validation using JWT tokens with support for role-based access control (RBAC). It integrates with multiple auth providers including custom JWT, Clerk, and SIWE (Sign-In with Ethereum).

## Key Concepts

### Authentication Flow
1. Client sends request with `Authorization: Bearer <token>` header
2. Middleware extracts and validates token
3. Token payload is attached to `req.user`
4. Role-based checks are applied
5. Request proceeds to handler

### Token Structure

```javascript
// JWT Payload
{
  "sub": "user_123",
  "email": "user@example.com",
  "role": "member",
  "iat": 1713123456,
  "exp": 1713130656  // 2 hours
}
```

### Roles & Permissions

| Role | Permissions |
|------|-------------|
| admin | Full access to all endpoints |
| member | Standard user access |
| guest | Read-only access |
| service | API key access only |

## Implementation

### Auth Middleware

```javascript
// middleware/auth.js
const jwt = require('jsonwebtoken');
const AUTH_SECRET = process.env.AUTH_SECRET || 'default-secret';

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Missing or invalid authorization header' 
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, AUTH_SECRET);
      req.user = decoded;
      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Auth middleware error' });
  }
};

module.exports = authMiddleware;
```

### Role-Based Middleware

```javascript
// middleware/access-control.js
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions' 
      });
    }
    
    next();
  };
};

// Usage examples
router.get('/admin', authMiddleware, requireRole('admin'), adminHandler);
router.put('/settings', authMiddleware, requireRole('admin', 'member'), settingsHandler);
```

### Session Management

```javascript
// Token refresh endpoint
app.post('/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  
  try {
    const decoded = jwt.verify(refreshToken, AUTH_SECRET);
    
    const newToken = jwt.sign(
      { 
        sub: decoded.sub, 
        email: decoded.email, 
        role: decoded.role 
      },
      AUTH_SECRET,
      { expiresIn: '2h' }
    );
    
    res.json({ 
      token: newToken,
      expiresIn: 7200
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});
```

## API Key Authentication

```javascript
// middleware/api-key-auth.js
const apiKeyAuth = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  // Validate against stored keys
  const validKey = await validateApiKey(apiKey);
  
  if (!validKey) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  
  req.apiKey = validKey;
  next();
};

// Usage for service endpoints
router.get('/api/service/data', apiKeyAuth, serviceHandler);
```

## Best Practices

1. **Use short-lived access tokens** (1-2 hours)
2. **Implement refresh tokens** for seamless re-authentication
3. **Store tokens securely** - prefer httpOnly cookies
4. **Validate on every request** - don't cache token validity
5. **Log authentication failures** for security monitoring

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 on valid token | Check token expiration, verify AUTH_SECRET |
| Role check failing | Verify role in token payload matches |
| CORS preflight fail | Configure CORS for auth endpoints |

## Related Pages

- [API Gateway](backend/api-gateway)
- [Access Control](middleware/access-control)
- [API Key Authentication](middleware/api-key-auth)

---

## Access Control

```yaml
---
title: Access Control
slug: middleware/access-control
audience: Backend Developers, Security Engineers
summary: Implementation of role-based access control (RBAC), permission management, and zero-trust security model
prerequisites:
  - Authentication concepts
  - User roles understanding
  - Security best practices
topics:
  - RBAC Implementation
  - Permission Management
  - Zero Trust Model
  - Rate Limiting
keywords:
  - Access Control
  - RBAC
  - Permissions
  - Security
dependencies:
  - express-rate-limit
author: Security Team
version: 2.0
last_updated: 2026-04-15
---

# Access Control

## Overview

The access control system implements role-based access control (RBAC) with zero-trust principles. Every request is authenticated and authorized, with granular permissions based on user roles.

## Key Concepts

### Permission Matrix

| Action | admin | member | guest | service |
|--------|-------|--------|-------|---------|
| Read all data | ✓ | ✓ | ✓ | ✓ |
| Write data | ✓ | ✓ | ✗ | ✓ |
| Delete data | ✓ | ✗ | ✗ | ✗ |
| Manage users | ✓ | ✗ | ✗ | ✗ |
| View analytics | ✓ | ✓ | ✗ | ✗ |
| Manage billing | ✓ | ✗ | ✗ | ✗ |

### Zero Trust Model

1. **Never trust** - Always verify
2. **Least privilege** - Minimum access needed
3. **Assume breach** - Monitor for anomalies
4. **Verify explicitly** - Check every request

## Implementation

### Rate Limiting

```javascript
// middleware/rate-limit.js
const rateLimit = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: 'Too many requests, please try again later' }
});

// Strict limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: { error: 'Too many login attempts' }
});

// Premium tier limiter
const premiumLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  keyGenerator: (req) => req.user?.id || req.ip
});

// Apply limiters
app.use('/api/', apiLimiter);
app.use('/auth/login', authLimiter);
app.use('/api/', premiumLimiter); // for authenticated users
```

### Permission Checker

```javascript
// middleware/permissions.js
const checkPermission = (permission) => {
  return (req, res, next) => {
    const userRole = req.user?.role || 'guest';
    const permissions = {
      admin: ['*'],
      member: ['read', 'write_own'],
      guest: ['read'],
      service: ['read', 'write', 'service']
    };
    
    const userPerms = permissions[userRole] || [];
    
    if (userPerms.includes('*') || userPerms.includes(permission)) {
      return next();
    }
    
    return res.status(403).json({
      error: 'Insufficient permissions',
      required: permission,
      current: userRole
    });
  };
};

// Usage
router.delete('/users/:id', 
  authMiddleware, 
  checkPermission('manage_users'), 
  deleteUserHandler
);
```

### Zero Trust Implementation

```javascript
// middleware/zero-trust.js
const zeroTrust = async (req, res, next) => {
  // 1. Verify authentication
  if (!req.user && !req.apiKey) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // 2. Check IP reputation (if available)
  const clientIp = req.ip;
  const ipAllowed = await checkIpReputation(clientIp);
  
  if (!ipAllowed) {
    return res.status(403).json({ error: 'IP not trusted' });
  }
  
  // 3. Verify request integrity
  const signature = req.headers['x-request-signature'];
  if (signature && !verifyRequestSignature(req, signature)) {
    return res.status(403).json({ error: 'Request integrity check failed' });
  }
  
  // 4. Log for audit
  await logAccessRequest({
    user: req.user?.sub || req.apiKey?.id,
    ip: clientIp,
    path: req.path,
    method: req.method,
    timestamp: Date.now()
  });
  
  next();
};
```

## Best Practices

1. **Implement defense in depth** - multiple layers of security
2. **Log all access attempts** - successful and failed
3. **Use IP allowlists** for sensitive endpoints
4. **Rotate API keys** regularly
5. **Monitor for anomalies** - unusual access patterns

## Related Pages

- [Authentication Middleware](middleware/auth)
- [Error Handling](middleware/error-handling)

---

## Middleware Error Handling

```yaml
---
title: Error Handling
slug: middleware/error-handling
audience: Backend Developers
summary: Comprehensive error handling strategy including error classes, centralized handlers, and proper error responses
prerequisites:
  - Express.js error propagation
  - Error types in JavaScript
topics:
  - Error Classes
  - Error Middleware
  - Error Responses
  - Logging
keywords:
  - Error Handling
  - Middleware
  - Error Recovery
author: Platform Team
version: 2.0
last_updated: 2026-04-15
---

# Error Handling

## Overview

The error handling system provides centralized error management with proper classification, logging, and client-friendly responses. All errors follow a consistent structure for easier debugging.

## Key Concepts

### Error Classification

| Type | Code Range | Description |
|------|------------|-------------|
| Validation | 1000-1999 | Input validation errors |
| Authentication | 2000-2999 | Auth failures |
| Authorization | 3000-3999 | Permission errors |
| Not Found | 4000-4999 | Resource not found |
| External | 5000-5999 | Third-party failures |
| Internal | 9000-9999 | System errors |

## Implementation

### Error Classes

```javascript
// lib/errors.js
class AppError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = {}) {
    super(message, 'VALIDATION_ERROR', 400);
    this.details = details;
  }
}

class AuthError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 'AUTH_ERROR', 401);
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}

class NotFoundError extends AppError {
  constructor(resource) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}

class ExternalError extends AppError {
  constructor(service, message) {
    super(`${service}: ${message}`, 'EXTERNAL_ERROR', 502);
    this.service = service;
  }
}
```

### Error Middleware

```javascript
// middleware/error-handler.js
const errorHandler = (err, req, res, next) => {
  // Log error details
  console.error('Error:', {
    message: err.message,
    code: err.code,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    user: req.user?.sub
  });
  
  // Handle specific error types
  if (err instanceof ValidationError) {
    return res.status(400).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details
      }
    });
  }
  
  if (err instanceof AuthError) {
    return res.status(401).json({
      success: false,
      error: {
        code: err.code,
        message: err.message
      }
    });
  }
  
  if (err instanceof AuthorizationError) {
    return res.status(403).json({
      success: false,
      error: {
        code: err.code,
        message: err.message
      }
    });
  }
  
  if (err instanceof NotFoundError) {
    return res.status(404).json({
      success: false,
      error: {
        code: err.code,
        message: err.message
      }
    });
  }
  
  // Default to 500 Internal Server Error
  res.status(err.statusCode || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' 
        ? err.message 
        : 'An unexpected error occurred'
    }
  });
};

// 404 handler for unmatched routes
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Cannot ${req.method} ${req.path}`
    }
  });
};

module.exports = { errorHandler, notFoundHandler };
```

### Async Handler Wrapper

```javascript
// utils/async-handler.js
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Usage
router.get('/users/:id', 
  asyncHandler(async (req, res) => {
    const user = await getUserById(req.params.id);
    if (!user) throw new NotFoundError('User');
    res.json({ success: true, data: user });
  })
);
```

## Best Practices

1. **Use custom error classes** for better classification
2. **Never expose internal errors** to clients in production
3. **Log errors with context** for debugging
4. **Return consistent error format** across all endpoints
5. **Handle promises correctly** with async/await

## Related Pages

- [Logging & Monitoring](middleware/logging)
- [API Endpoints](backend/api-endpoints)

---

## Middleware Logging

```yaml
---
title: Logging & Monitoring
slug: middleware/logging
audience: Backend Developers, DevOps Engineers
summary: Implementation of request logging, performance monitoring, and system health tracking
prerequisites:
  - Logging libraries
  - Monitoring tools
  - Performance metrics
topics:
  - Request Logging
  - Performance Monitoring
  - Health Checks
  - Metrics Collection
keywords:
  - Logging
  - Monitoring
  - Metrics
  - Health
author: Platform Team
version: 2.0
last_updated: 2026-04-15
---

# Logging & Monitoring

## Overview

The logging and monitoring system provides comprehensive visibility into system operations, request flows, and performance metrics. It integrates with the TVM (Topology Visibility Matrix) for health monitoring.

## Key Concepts

### Log Levels

| Level | Usage |
|-------|-------|
| error | Failures and exceptions |
| warn | Potential issues |
| info | Normal operations |
| debug | Detailed debugging |

### Health Check Categories

1. **Basic**: Service is responding
2. **Detailed**: All dependencies healthy
3. **Deep**: Full system diagnostics

## Implementation

### Request Logger

```javascript
// middleware/request-logger.js
const requestLogger = (req, res, next) => {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}`;
  
  req.requestId = requestId;
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    const logEntry = {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      user: req.user?.sub || 'anonymous'
    };
    
    if (res.statusCode >= 500) {
      console.error('[ERROR]', JSON.stringify(logEntry));
    } else if (res.statusCode >= 400) {
      console.warn('[WARN]', JSON.stringify(logEntry));
    } else {
      console.log('[INFO]', JSON.stringify(logEntry));
    }
  });
  
  next();
};
```

### Health Monitor

```javascript
// lib/health-monitor.js
const healthMonitor = {
  checks: new Map(),
  
  registerCheck(name, checkFn) {
    this.checks.set(name, checkFn);
  },
  
  async runCheck(name) {
    const check = this.checks.get(name);
    if (!check) return { status: 'unknown' };
    
    try {
      const result = await check();
      return { status: 'healthy', ...result };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  },
  
  async getFullHealth() {
    const results = {};
    for (const [name] of this.checks) {
      results[name] = await this.runCheck(name);
    }
    
    const allHealthy = Object.values(results).every(
      r => r.status === 'healthy'
    );
    
    return {
      status: allHealthy ? 'healthy' : 'degraded',
      checks: results,
      timestamp: Date.now()
    };
  }
};

// Register standard health checks
healthMonitor.registerCheck('database', async () => {
  // Check database connectivity
  const db = require('./db');
  return { connected: true };
});

healthMonitor.registerCheck('supabase', async () => {
  const { supabase } = require('./supabase');
  if (!supabase) return { configured: false };
  return { configured: true };
});

module.exports = healthMonitor;
```

### Health Endpoint

```javascript
// Health check endpoint
app.get('/api/health', async (req, res) => {
  const health = await healthMonitor.getFullHealth();
  const tvmSummary = tvm.getSummary();
  
  res.status(health.status === 'healthy' ? 200 : 503).json({
    status: health.status,
    timestamp: health.timestamp,
    checks: health.checks,
    tvm: tvmSummary
  });
});

app.get('/api/health/detailed', async (req, res) => {
  const health = await healthMonitor.getFullHealth();
  const tvmMatrix = tvm.getMatrix();
  
  res.json({
    status: health.status,
    timestamp: health.timestamp,
    checks: health.checks,
    tvm: {
      matrix: tvmMatrix,
      topology: _TVM_TOPOLOGY,
      recommendations: Object.keys(_TVM_REC_LIB).filter(k => k !== 'OK')
    }
  });
});
```

## Metrics Collection

```javascript
// metrics collection
const metrics = {
  requests: {
    total: 0,
    byStatus: {},
    byEndpoint: {}
  },
  
  recordRequest(method, path, status) {
    this.requests.total++;
    this.requests.byStatus[status] = (this.requests.byStatus[status] || 0) + 1;
    
    const endpoint = path.split('/')[2] || 'unknown';
    this.requests.byEndpoint[endpoint] = 
      (this.requests.byEndpoint[endpoint] || 0) + 1;
  },
  
  getMetrics() {
    return {
      requests: this.requests,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
  }
};
```

## Best Practices

1. **Include request IDs** for tracing
2. **Log all errors** with full context
3. **Monitor performance** with response times
4. **Track health** via TVM system
5. **Aggregate metrics** for dashboards

## Related Pages

- [Error Handling](middleware/error-handling)
- [API Gateway](backend/api-gateway)

---

# FRONTEND DOCUMENTATION

---

## Frontend Components

```yaml
---
title: Frontend Components
slug: frontend/components
audience: Frontend Developers
summary: Overview of the React-based frontend components including page structure, UI components, and styling
prerequisites:
  - React 18+
  - TypeScript
  - Vite
topics:
  - Component Architecture
  - UI Components
  - Styling
  - State Management
keywords:
  - React
  - Components
  - Frontend
  - TypeScript
author: Frontend Team
version: 2.0
last_updated: 2026-04-15
---

# Frontend Components

## Overview

The frontend is built with React 18, TypeScript, and Vite. It provides a modern, responsive interface for interacting with the AoE Unified backend services.

## Key Concepts

### Technology Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: CSS with CSS variables
- **Routing**: React Router (future)

### Component Structure

```
frontend/src/
├── App.tsx              # Main application component
├── main.tsx             # Application entry point
├── index.css            # Global styles
└── pages/               # Page components
    ├── Marketplace.tsx  # Main marketplace view
    ├── AdminControl.tsx # Admin dashboard
    └── ...
```

## Page Components

### App.tsx

```tsx
// main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// App.tsx
import { useState, useEffect } from 'react';

function App() {
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Initialize app
    setLoading(false);
  }, []);
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  return (
    <div className="app">
      <header>
        <h1>AoE Unified</h1>
      </header>
      <main>
        {/* Page content */}
      </main>
    </div>
  );
}

export default App;
```

### Marketplace Page

```tsx
// pages/Marketplace.tsx
import { useState, useEffect } from 'react';

interface Listing {
  id: string;
  name: string;
  description: string;
  price: number;
  status: 'active' | 'inactive';
}

export default function Marketplace() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchListings();
  }, []);
  
  const fetchListings = async () => {
    try {
      const response = await fetch('/api/marketplace/listings');
      const data = await response.json();
      setListings(data.data || []);
    } catch (error) {
      console.error('Failed to fetch listings:', error);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) return <div>Loading marketplace...</div>;
  
  return (
    <div className="marketplace">
      <h2>Marketplace</h2>
      <div className="listings-grid">
        {listings.map(listing => (
          <div key={listing.id} className="listing-card">
            <h3>{listing.name}</h3>
            <p>{listing.description}</p>
            <span className="price">${listing.price}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Styling

### CSS Variables

```css
/* index.css */
:root {
  --primary-color: #4f46e5;
  --secondary-color: #10b981;
  --danger-color: #ef4444;
  --background: #ffffff;
  --text-primary: #1f2937;
  --text-secondary: #6b7280;
  --border-color: #e5e7eb;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--background);
  color: var(--text-primary);
  margin: 0;
}

.app {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem;
}
```

## Best Practices

1. **Use TypeScript** for type safety
2. **Componentize** reusable UI elements
3. **Use CSS variables** for theming
4. **Implement proper loading states**
5. **Handle errors gracefully**

## Related Pages

- [State Management](frontend/state)
- [Frontend Routing](frontend/routing)

---

## Frontend State Management

```yaml
---
title: State Management
slug: frontend/state
audience: Frontend Developers
summary: State management approaches including local state, context API, and external data fetching patterns
prerequisites:
  - React hooks
  - State concepts
topics:
  - Local State
  - Context API
  - Data Fetching
  - Error Handling
keywords:
  - State Management
  - React Hooks
  - Context API
author: Frontend Team
version: 2.0
last_updated: 2026-04-15
---

# State Management

## Overview

The frontend uses React's built-in state management capabilities including local state with hooks, Context API for shared state, and data fetching patterns.

## Key Concepts

### State Types

| Type | Use Case |
|------|----------|
| Local (useState) | Component-specific state |
| Context | Shared global state |
| URL | Route parameters |
| Server State | API data |

## Implementation

### Local State

```tsx
// Component with local state
function Counter() {
  const [count, setCount] = useState(0);
  
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>
        Increment
      </button>
    </div>
  );
}
```

### Context API

```tsx
// auth-context.tsx
import { createContext, useContext, useState, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  login: (token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  
  const login = (token: string) => {
    // Decode token and set user
    const payload = JSON.parse(atob(token.split('.')[1]));
    setUser({ id: payload.sub, email: payload.email, role: payload.role });
    localStorage.setItem('token', token);
  };
  
  const logout = () => {
    setUser(null);
    localStorage.removeItem('token');
  };
  
  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      isAuthenticated: !!user 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
```

### Data Fetching

```tsx
// Custom hook for API calls
function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch');
        const json = await response.json();
        setData(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [url]);
  
  return { data, loading, error };
}

// Usage
function UserList() {
  const { data, loading, error } = useFetch<User[]>('/api/users');
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return (
    <ul>
      {data?.map(user => <li key={user.id}>{user.name}</li>)}
    </ul>
  );
}
```

## Best Practices

1. **Keep state close** to where it's used
2. **Use context sparingly** to avoid re-renders
3. **Implement loading/error states** for async operations
4. **Use TypeScript** for type safety
5. **Optimize re-renders** with useMemo/useCallback

## Related Pages

- [Frontend Components](frontend/components)
- [API Endpoints](backend/api-endpoints)

---

## Frontend Testing

```yaml
---
title: Frontend Testing
slug: frontend/testing
audience: Frontend Developers, QA Engineers
summary: Testing strategy for frontend components including unit tests, component testing, and integration tests
prerequisites:
  - JavaScript/TypeScript
  - Testing frameworks
topics:
  - Unit Testing
  - Component Testing
  - Integration Tests
  - E2E Testing
keywords:
  - Testing
  - Jest
  - React Testing
  - Playwright
author: QA Team
version: 2.0
last_updated: 2026-04-15
---

# Frontend Testing

## Overview

The frontend testing strategy covers multiple levels of testing from unit tests for utility functions to end-to-end tests for critical user flows.

## Key Concepts

### Testing Pyramid

```
       /\
      /E2E\       ← Few, slow, expensive
     /------\
    /Integration\ ← Medium count
   /--------------
  /    Unit       ← Many, fast, cheap
 /________________\
```

### Test Tools

- **Jest**: Unit and integration tests
- **React Testing Library**: Component tests
- **Playwright**: E2E tests

## Implementation

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '\\.(css|less|scss)$': 'identity-obj-proxy'
  },
  testMatch: ['**/*.test.{ts,tsx}'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts'
  ]
};
```

### Component Tests

```tsx
// components/Counter.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import Counter from './Counter';

describe('Counter', () => {
  it('renders initial count of 0', () => {
    render(<Counter />);
    expect(screen.getByText('Count: 0')).toBeInTheDocument();
  });
  
  it('increments count on button click', () => {
    render(<Counter />);
    const button = screen.getByText('Increment');
    fireEvent.click(button);
    expect(screen.getByText('Count: 1')).toBeInTheDocument();
  });
});
```

### Hook Tests

```tsx
// hooks/useCounter.test.ts
import { renderHook, act } from '@testing-library/react';
import { useCounter } from './useCounter';

describe('useCounter', () => {
  it('initializes with default value', () => {
    const { result } = renderHook(() => useCounter());
    expect(result.current.count).toBe(0);
  });
  
  it('initializes with provided value', () => {
    const { result } = renderHook(() => useCounter(10));
    expect(result.current.count).toBe(10);
  });
  
  it('increments count', () => {
    const { result } = renderHook(() => useCounter());
    act(() => result.current.increment());
    expect(result.current.count).toBe(1);
  });
});
```

### API Mocking

```javascript
// mocks/handlers.js
export const handlers = [
  rest.get('/api/users', (req, res, ctx) => {
    return res(
      ctx.json({
        success: true,
        data: [
          { id: '1', name: 'John Doe', email: 'john@example.com' }
        ]
      })
    );
  }),
  rest.post('/api/users', (req, res, ctx) => {
    return res(
      ctx.json({
        success: true,
        data: { id: '2', ...req.body }
      })
    );
  })
];
```

## Best Practices

1. **Test behavior, not implementation** - focus on what, not how
2. **Use meaningful test descriptions** - describe the scenario
3. **Test edge cases** - boundary conditions
4. **Mock external dependencies** - API calls, timers
5. **Aim for high coverage** on critical paths

## Related Pages

- [Frontend Components](frontend/components)
- [Backend Testing](backend/testing)

---

# VALIDATION SUMMARY

## Gaps Identified & Filled

### Completed Documentation Pages

| Section | Pages Created | Status |
|---------|---------------|--------|
| **Backend** | API Gateway Architecture | ✓ Complete |
| | API Endpoints Reference | ✓ Complete |
| | Database Configuration | ✓ Complete |
| **Middleware** | Authentication Middleware | ✓ Complete |
| | Access Control | ✓ Complete |
| | Error Handling | ✓ Complete |
| | Logging & Monitoring | ✓ Complete |
| | Request Routing | ✓ Covered in API Gateway |
| | Caching | - Gap: Not implemented in codebase |
| **Frontend** | Components | ✓ Complete |
| | State Management | ✓ Complete |
| | Testing | ✓ Complete |
| | Routing | - Gap: Not implemented in codebase |
| | Accessibility | - Gap: Not implemented in codebase |

### Remaining Gaps

1. **Caching** - No Redis caching implementation found (configuration exists in package.json but not actively used)
2. **Frontend Routing** - Not implemented (single page app structure)
3. **Accessibility** - No ARIA attributes or accessibility features found

## Clarifying Questions

1. **Preferred language for code examples?** - Currently using JavaScript/TypeScript. Would you like Python examples for any sections?

2. **Target framework details?** - For backend, confirming Express.js 5.x. For frontend, React 18 + TypeScript + Vite.

3. **Naming conventions?** - Using camelCase for variables, PascalCase for components, kebab-case for file names.

4. **Additional sections needed?** - Consider adding:
   - Deployment documentation
   - CI/CD pipeline documentation
   - Security hardening guide

## Staged Plan for Subsequent Updates

### Phase 1: Core Documentation (Complete)
- Backend API reference
- Middleware stack
- Frontend components

### Phase 2: Advanced Topics (Next)
- Performance optimization
- Security hardening
- Deployment guides

### Phase 3: Operations (Future)
- Monitoring setup
- Incident response
- Runbooks