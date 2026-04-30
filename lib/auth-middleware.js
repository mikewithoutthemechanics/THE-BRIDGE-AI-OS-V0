/**
 * Unified Auth Middleware — Bridge AI OS
 *
 * Single auth layer using Supabase tokens.
 * - verifySupabaseAuth:  Full verification via Supabase Admin API
 * - requireRole:         Gate access by role (admin/user/superadmin)
 * - extractUser:         Return user object or 401
 *
 * Usage:
 *   const { verifySupabaseAuth, requireRole } = require('../lib/auth-middleware');
 *
 *   app.get('/api/admin/stats', verifySupabaseAuth, requireRole('admin'), handler);
 *   app.get('/api/user/dashboard', verifySupabaseAuth, requireRole('user'), handler);
 */

'use strict';

const { supabaseAdmin } = require('./supabase');

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(req) {
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
}

/**
 * Parse raw JSON body from req
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (_) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

/**
 * Middleware: verifySupabaseAuth
 * Adds `req.user` and `req.supabaseToken` on success, or responds 401.
 *
 * Works in two modes:
 *  1. Admin verification — uses service role key to introspect token (server-side). No network roundtrip to Supabase.
 *     This ONLY works if the JWT was issued by your Supabase project and is still valid.
 *  2. Fallback admin=getUserByToken — contacts Supabase (slower)
 */
async function verifySupabaseAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      return res.writeHead(401, { 'Content-Type': 'application/json' })
                .end(JSON.stringify({ error: 'Unauthorized — Bearer token required' }));
    }

    // Use Admin API to GET user by token. This verifies signature & expiry without needing a network call
    // to Supabase if we have the service-role key and JWT secret locally (which admin client does).
    const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserByToken(token)
      .catch(() => ({ data: { user: null }, error: { message: 'Token verification failed' } }));

    if (error || !user) {
      return res.writeHead(401, { 'Content-Type': 'application/json' })
                .end(JSON.stringify({ error: error?.message || 'Invalid or expired token' }));
    }

    // Attach user info to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.user_metadata?.role || 'user',
      metadata: user.user_metadata || {},
      confirmedAt: user.confirmed_at,
      created_at: user.created_at,
    };
    req.supabaseToken = token;

    next();
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ error: 'Auth middleware error', details: err.message }));
  }
}

/**
 * Middleware factory: requireRole(role)
 * Only allows access to users with exact role match. (admin/superadmin/user)
 *
 * Pass as:  app.get('/admin', verifySupabaseAuth, requireRole('admin'), handler)
 */
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.writeHead(401, { 'Content-Type': 'application/json' })
                .end(JSON.stringify({ error: 'Authentication required' }));
    }

    // Superadmin can access anything
    if (req.user.role === 'superadmin') return next();

    if (req.user.role !== role) {
      return res.writeHead(403, { 'Content-Type': 'application/json' })
                .end(JSON.stringify({ error: `Forbidden — requires ${role} role` }));
    }

    next();
  };
}

/**
 * Alternative: requireRoleAny(...roles)
 */
function requireRoleAny(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.writeHead(401, { 'Content-Type': 'application/json' })
                .end(JSON.stringify({ error: 'Authentication required' }));
    }
    if (roles.includes(req.user.role) || req.user.role === 'superadmin') return next();
    return res.writeHead(403, { 'Content-Type': 'application/json' })
             .end(JSON.stringify({ error: `Forbidden — requires one of [${roles.join(', ')}]` }));
  };
}

/**
 * Utility: getUserFromRequest(req)
 * Returns user object or null if not authenticated
 */
function getUserFromRequest(req) {
  return req.user || null;
}

module.exports = {
  verifySupabaseAuth,
  requireRole,
  requireRoleAny,
  getUserFromRequest,
  extractBearerToken,
  parseBody,
};
