/**
 * BRIDGE AI OS — User Identity & Nurture Routes
 *
 * Registers authentication, user journey, and nurture/CRM endpoints.
 *
 * Usage:
 *   const { registerUserRoutes } = require('./lib/user-routes');
 *   registerUserRoutes(app);
 */

'use strict';

const userDb = require('./user-identity');
const nurture = require('./nurture-engine');

// ── Auth Middleware ──────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'Missing auth token' });

  const user = userDb.verifyAuthToken(token);
  if (!user) return res.status(401).json({ ok: false, error: 'Invalid or expired token' });

  req.user = user;
  next();
}

// Optional auth: attaches user if token present, but does not block
function optionalAuth(req, _res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    req.user = userDb.verifyAuthToken(token) || null;
  }
  next();
}

// ── Register Routes ─────────────────────────────────────────────────────────
function registerUserRoutes(app) {

  // ═══════════════════════════════════════════════════════════════════════════
  //  AUTHENTICATION
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /api/auth/register
  app.post('/api/auth/register', (req, res) => {
    try {
      const { email, name, password } = req.body || {};
      if (!email) return res.status(400).json({ ok: false, error: 'Email is required' });
      if (!password) return res.status(400).json({ ok: false, error: 'Password is required' });

      const user = userDb.createUser(email, name, 'email', null, password);
      const token = userDb.generateAuthToken(user.id);

      // Auto-evaluate and advance
      const result = nurture.autoAdvance(user);
      if (result.advanced) {
        userDb.updateFunnelStage(user.id, result.newStage);
        if (result.score_delta) userDb.updateLeadScore(user.id, result.score_delta);
      }

      const freshUser = userDb.getUserById(user.id);
      res.json({
        ok: true,
        token,
        user: sanitizeUser(freshUser),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /api/auth/login
  app.post('/api/auth/login', (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ ok: false, error: 'Email and password required' });

      const user = userDb.getUserByEmail(email);
      if (!user) return res.status(401).json({ ok: false, error: 'Invalid credentials' });
      if (!userDb.verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ ok: false, error: 'Invalid credentials' });
      }

      const token = userDb.generateAuthToken(user.id);
      res.json({ ok: true, token, user: sanitizeUser(user) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /api/auth/google
  app.post('/api/auth/google', (req, res) => {
    try {
      const { oauth_token } = req.body || {};
      if (!oauth_token) return res.status(400).json({ ok: false, error: 'OAuth token required' });

      // Decode Google JWT token (basic validation — production should verify with Google)
      let payload;
      try {
        const parts = oauth_token.split('.');
        payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      } catch (_) {
        return res.status(400).json({ ok: false, error: 'Invalid OAuth token format' });
      }

      const email = payload.email;
      const name = payload.name || payload.given_name || null;
      const sub = payload.sub;
      if (!email) return res.status(400).json({ ok: false, error: 'Token missing email' });

      const user = userDb.createUser(email, name, 'google', sub);
      const token = userDb.generateAuthToken(user.id);

      res.json({ ok: true, token, user: sanitizeUser(user) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/auth/me
  app.get('/api/auth/me', authMiddleware, (req, res) => {
    const user = userDb.getUserById(req.user.id);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    const prompt = nurture.getPersonalizedPrompt(user);
    res.json({ ok: true, user: sanitizeUser(user), nurture_prompt: prompt });
  });

  // POST /api/auth/logout
  app.post('/api/auth/logout', (_req, res) => {
    // Stateless tokens: client discards token. Server acknowledges.
    res.json({ ok: true, message: 'Logged out' });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  USER JOURNEY
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /api/user/page-visit
  app.post('/api/user/page-visit', authMiddleware, (req, res) => {
    try {
      const { page } = req.body || {};
      if (!page) return res.status(400).json({ ok: false, error: 'Page is required' });

      const user = userDb.recordPageVisit(req.user.id, page);

      // Auto-advance funnel
      const result = nurture.autoAdvance(user);
      if (result.advanced) {
        userDb.updateFunnelStage(user.id, result.newStage);
        if (result.score_delta) userDb.updateLeadScore(user.id, result.score_delta);
      }

      res.json({ ok: true, page, funnel_stage: (result.advanced ? result.newStage : user.funnel_stage) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /api/user/conversation
  app.post('/api/user/conversation', optionalAuth, (req, res) => {
    try {
      if (!req.user) return res.json({ ok: true, message: 'Anonymous conversation recorded' });

      const user = userDb.recordConversation(req.user.id);

      // Auto-advance funnel
      const result = nurture.autoAdvance(user);
      if (result.advanced) {
        userDb.updateFunnelStage(user.id, result.newStage);
        if (result.score_delta) userDb.updateLeadScore(user.id, result.score_delta);
      }

      res.json({ ok: true, conversations: user.conversations, funnel_stage: user.funnel_stage });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/user/journey
  app.get('/api/user/journey', authMiddleware, (req, res) => {
    const user = userDb.getUserById(req.user.id);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    let pages = [];
    try { pages = JSON.parse(user.pages_visited || '[]'); } catch (_) {}

    const prompt = nurture.getPersonalizedPrompt(user);

    res.json({
      ok: true,
      journey: {
        pages,
        conversations: user.conversations,
        funnel_stage: user.funnel_stage,
        lead_score: user.lead_score,
        plan: user.plan,
        first_seen: user.first_seen,
        last_seen: user.last_seen,
      },
      nurture_prompt: prompt,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  NURTURE / CRM
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/nurture/queue
  app.get('/api/nurture/queue', (req, res) => {
    const queue = userDb.getNurtureQueue();
    res.json({
      ok: true,
      queue: queue.map(u => sanitizeUser(u)),
      count: queue.length,
    });
  });

  // POST /api/nurture/advance
  app.post('/api/nurture/advance', (req, res) => {
    try {
      const { user_id, stage } = req.body || {};
      if (!user_id) return res.status(400).json({ ok: false, error: 'user_id required' });

      const user = userDb.getUserById(user_id);
      if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

      if (stage) {
        // Manual advance to specific stage
        const updated = userDb.updateFunnelStage(user_id, stage);
        return res.json({ ok: true, user: sanitizeUser(updated) });
      }

      // Auto-advance to next stage
      const currentIdx = userDb.FUNNEL_ORDER.indexOf(user.funnel_stage || 'visitor');
      if (currentIdx < userDb.FUNNEL_ORDER.length - 1) {
        const nextStage = userDb.FUNNEL_ORDER[currentIdx + 1];
        const updated = userDb.updateFunnelStage(user_id, nextStage);
        return res.json({ ok: true, user: sanitizeUser(updated), advanced_to: nextStage });
      }

      res.json({ ok: true, message: 'User already at highest stage', user: sanitizeUser(user) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/nurture/funnel
  app.get('/api/nurture/funnel', (_req, res) => {
    const stats = userDb.getFunnelStats();
    res.json({ ok: true, ...stats });
  });

  // GET /api/nurture/leads
  app.get('/api/nurture/leads', (_req, res) => {
    const leads = userDb.getAllUsers({ funnel_stage: null });
    // Return all users sorted by lead_score desc
    const sorted = leads.sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0));
    res.json({
      ok: true,
      leads: sorted.map(u => sanitizeUser(u)),
      total: sorted.length,
    });
  });

  console.log('[USER-ROUTES] Auth + Journey + Nurture routes registered');
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, ...safe } = user;
  return safe;
}

module.exports = { registerUserRoutes };
