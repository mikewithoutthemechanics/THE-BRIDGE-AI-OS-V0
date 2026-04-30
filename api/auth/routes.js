/**
 * Supabase Auth Wrapper — replaces legacy auth-service.js
 *
 * Exposes Express routes for registration, login, logout, session refresh,
 * and "current user" lookup — all backed by Supabase Auth.
 *
 * Routes:
 *   POST /api/auth/register  { email, password, role?, metadata? }
 *   POST   /api/auth/login    { email, password }
 *   POST   /api/auth/logout   (requires Bearer token)
 *   GET    /api/auth/me       (requires Bearer token)
 *   POST   /api/auth/refresh  (refresh token → new access token)
 *
 * Returns on success:
 *   { user, session: { access_token, refresh_token, expires_in } }
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[AUTH] SUPABASE_URL and SUPABASE_ANON_KEY must be set.');
  module.exports = (req, res) => {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Auth service misconfigured — Supabase env missing' }));
  };
} else {
  // Public client (for sign-up/login — limited to what Supabase allows)
  const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Admin client — full service role (for admin operations)
  const supabaseAdmin = SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : supabaseAnon;

  // ── Route handler factory ────────────────────────────────────────────────────

  /**
   * X-Forwarded-* aware helper
   */
  function getIP(req) {
    return (
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      '127.0.0.1'
    );
  }

  /**
   * Parse JSON body from req (with length limit)
   */
  function parseBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
        if (data.length > 1e6) reject(new Error('Payload too large'));
      });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Send JSON response
   */
  function json(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    });
    res.end(body);
  }

  /**
   * CORS preflight
   */
  function handleOptions(req, res) {
    json(res, 204, {});
  }

  /**
   * POST /api/auth/register
   * Creates a new user via Supabase Auth + optional metadata
   */
  async function handleRegister(req, res) {
    try {
      const body = await parseBody(req);
      const { email, password, name, role, metadata } = body;

      if (!email || !password) {
        return json(res, 400, { ok: false, error: 'email and password are required' });
      }
      if (password.length < 6) {
        return json(res, 400, { ok: false, error: 'password must be at least 6 characters' });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Build user_metadata
      const userMetadata = { role: role || 'user' };
      if (name) userMetadata.name = name;
      if (metadata) Object.assign(userMetadata, metadata);

      // Create user in Supabase Auth
      const { data: { user: supaUser }, error: signupError } = await supabaseAnon.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      });

      if (signupError) {
        if (signupError.message && signupError.message.toLowerCase().includes('already registered')) {
          return json(res, 409, { ok: false, error: 'Email already registered' });
        }
        return json(res, 500, { ok: false, error: signupError.message });
      }

      // Immediately sign in to get session tokens
      const { data: { session }, error: loginError } = await supabaseAnon.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (loginError || !session) {
        return json(res, 500, { ok: false, error: 'Account created but login failed — please try logging in' });
      }

      const userRole = (supaUser.user_metadata && supaUser.user_metadata.role) || 'user';

      // Return user + tokens in Bridge-compatible shape
      json(res, 201, {
        ok: true,
        token: session.access_token,
        refresh_token: session.refresh_token,
        userId: supaUser.id,
        email: normalizedEmail,
        role: userRole,
        user: {
          id: supaUser.id,
          email: normalizedEmail,
          role: userRole,
          metadata: supaUser.user_metadata,
        },
        expiresAt: new Date(session.expires_in * 1000 + Date.now()).toISOString(),
      });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  }

  /**
   * POST /api/auth/login
   * Standard email+password login
   */
  async function handleLogin(req, res) {
    try {
      const body = await parseBody(req);
      const { email, password } = body;

      if (!email || !password) {
        return json(res, 400, { ok: false, error: 'email and password are required' });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const { data: { session, user: supaUser }, error } = await supabaseAnon.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error || !session || !supaUser) {
        return json(res, 401, { ok: false, error: 'Invalid credentials' });
      }

      const userRole = (supaUser.user_metadata && supaUser.user_metadata.role) || 'user';

      json(res, 200, {
        ok: true,
        token: session.access_token,
        refresh_token: session.refresh_token,
        userId: supaUser.id,
        email: normalizedEmail,
        role: userRole,
        user: {
          id: supaUser.id,
          email: normalizedEmail,
          role: userRole,
          metadata: supaUser.user_metadata,
        },
        expiresAt: new Date(session.expires_in * 1000 + Date.now()).toISOString(),
      });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  }

  /**
   * POST /api/auth/logout
   * Invalidates the refresh token server-side + clears local Bridge token
   */
  async function handleLogout(req, res) {
    try {
      // Extract Bearer token
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

      // Logout from Supabase — revokes all refresh tokens for user
      if (token) {
        await supabaseAdmin.auth.admin.signOut(token).catch(() => {});
        await supabaseAnon.auth.signOut().catch(() => {});
      }

      // Frontend should also clear Bridge token and Supabase localStorage
      json(res, 200, { status: 'logged_out' });
    } catch (err) {
      json(res, 200, { status: 'logged_out_with_errors', note: err.message });
    }
  }

  /**
   * GET /api/auth/me
   * Returns current user info from token
   */
  async function handleMe(req, res) {
    try {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

      if (!token) {
        return json(res, 401, { ok: false, error: 'Unauthorized — Bearer token required' });
      }

      // Verify token with Supabase
      const { data: { user: supaUser }, error } = await supabaseAdmin.auth.admin.getUserByToken(token)
        .catch(() => ({ data: { user: null }, error: { message: 'Token verification failed' } }));

      if (error || !supaUser) {
        return json(res, 401, { ok: false, error: error?.message || 'Invalid token' });
      }

      json(res, 200, {
        ok: true,
        user: {
          id: supaUser.id,
          email: supaUser.email,
          role: supaUser.user_metadata?.role || 'user',
          metadata: supaUser.user_metadata,
        },
      });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  }

  /**
   * POST /api/auth/refresh
   * Refresh access token using refresh token (passed in body or cookie)
   */
  async function handleRefresh(req, res) {
    try {
      const body = await parseBody(req);
      const { refresh_token } = body;

      if (!refresh_token) {
        return json(res, 400, { ok: false, error: 'refresh_token is required in body' });
      }

      const { data: { session }, error } = await supabaseAnon.auth.refreshSession(refresh_token);

      if (error || !session) {
        return json(res, 401, { ok: false, error: 'Refresh token invalid or expired' });
      }

      json(res, 200, {
        ok: true,
        token: session.access_token,
        refresh_token: session.refresh_token,
        expiresAt: new Date(session.expires_in * 1000 + Date.now()).toISOString(),
      });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  }

  // ── Router ────────────────────────────────────────────────────────────────────

  async function router(req, res) {
    const url = req.url || '';

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return handleOptions(req, res);
    }

    try {
      // ── Auth routes ───────────────────────────────────────────────────────────
      if (url === '/api/auth/register' && req.method === 'POST') {
        return handleRegister(req, res);
      }

      if (url === '/api/auth/login' && req.method === 'POST') {
        return handleLogin(req, res);
      }

      if (url === '/api/auth/logout' && req.method === 'POST') {
        return handleLogout(req, res);
      }

      if (url === '/api/auth/me') {
        if (req.method === 'GET') return handleMe(req, res);
        if (req.method === 'POST') return handleMe(req, res); // alias
      }

      if (url === '/api/auth/refresh' && req.method === 'POST') {
        return handleRefresh(req, res);
      }

      // Not found
      json(res, 404, { error: 'Not found' });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  }

  module.exports = router;
}
