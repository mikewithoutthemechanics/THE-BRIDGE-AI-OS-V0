'use strict';

/**
 * [Agent-5A] Unified Auth & Referral Service
 * Port: 9005
 * Consolidates: aoe-unified auth, bridgeos auth, BRIDGE_AI_OS auth
 *               + their respective referral systems
 *
 * No external npm packages — only Node.js built-ins:
 *   http, crypto, fs, path, url
 */

const http   = require('http');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const { URL } = require('url');

// ── CONFIG ────────────────────────────────────────────────────────────────────

const PORT          = 9005;
const SHARED_DIR    = path.join(__dirname, '..', 'shared');
const USERS_FILE    = path.join(SHARED_DIR, 'users.json');
const REFERRALS_FILE = path.join(SHARED_DIR, 'referrals.json');

// Secret used for HMAC token signing — override via env in production
const TOKEN_SECRET  = process.env.AUTH_TOKEN_SECRET || 'aoe-unified-auth-secret-change-me';

// Token TTL: 24 hours in milliseconds
const TOKEN_TTL_MS  = 24 * 60 * 60 * 1000;

// Accepted legacy auth source identifiers (per spec)
const VALID_SOURCES = new Set([
  'aoe-unified',
  'bridgeos',
  'BRIDGE_AI_OS',
]);

// ── PERSISTENCE ───────────────────────────────────────────────────────────────

function ensureSharedDir() {
  if (!fs.existsSync(SHARED_DIR)) {
    fs.mkdirSync(SHARED_DIR, { recursive: true });
  }
}

function loadJSON(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return defaultValue;
  }
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// In-memory stores (source-of-truth is the JSON files; loaded on start)
let users     = {};   // { [email]: { email, passwordHash, salt, source, createdAt, id } }
let referrals = {};   // { [code]: { code, ownerId, uses: [...], createdAt } }
let revokedTokens = new Set();  // invalidated token ids

function persistUsers()     { saveJSON(USERS_FILE, users); }
function persistReferrals() { saveJSON(REFERRALS_FILE, referrals); }

// ── CRYPTO HELPERS ────────────────────────────────────────────────────────────

function hashPassword(password, salt) {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function generateUserId() {
  return 'usr_' + crypto.randomBytes(12).toString('hex');
}

/**
 * Token format (no external JWT lib):
 *   base64url(header).base64url(payload).base64url(hmac-signature)
 *
 * header:  { alg: "HMAC-SHA256", typ: "AOE-TOKEN" }
 * payload: { sub: userId, jti: tokenId, iat: issuedAt, exp: expiresAt, src: source }
 */
function b64url(str) {
  return Buffer.from(str).toString('base64url');
}

function fromB64url(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

function signToken(payload) {
  const header  = b64url(JSON.stringify({ alg: 'HMAC-SHA256', typ: 'AOE-TOKEN' }));
  const body    = b64url(JSON.stringify(payload));
  const sig     = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts;
  const expected = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');

  // Constant-time compare
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  let payload;
  try { payload = JSON.parse(fromB64url(body)); } catch (_) { return null; }

  if (Date.now() > payload.exp) return null;           // expired
  if (revokedTokens.has(payload.jti)) return null;     // revoked

  return payload;
}

function issueToken(userId, source) {
  const jti = crypto.randomBytes(16).toString('hex');
  const iat = Date.now();
  const exp = iat + TOKEN_TTL_MS;
  const payload = { sub: userId, jti, iat, exp, src: source || 'aoe-unified' };
  return { token: signToken(payload), jti, exp };
}

function generateReferralCode() {
  return 'REF-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

// ── REQUEST HELPERS ───────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (_) { resolve({}); }
    });
    req.on('error', reject);
  });
}

function send(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function ok(res, body)    { send(res, 200, body); }
function created(res, body) { send(res, 201, body); }
function badRequest(res, msg)  { send(res, 400, { error: msg }); }
function unauthorized(res, msg) { send(res, 401, { error: msg || 'Unauthorized' }); }
function conflict(res, msg)    { send(res, 409, { error: msg }); }
function notFound(res)         { send(res, 404, { error: 'Not found' }); }

function extractBearerToken(req) {
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
}

// ── ROUTE HANDLERS ────────────────────────────────────────────────────────────

/**
 * POST /auth/register
 * Body: { email, password, source?, referralCode? }
 */
async function handleRegister(req, res) {
  const body = await readBody(req);
  const { email, password, source, referralCode } = body;

  if (!email || typeof email !== 'string') return badRequest(res, 'email is required');
  if (!password || typeof password !== 'string') return badRequest(res, 'password is required');
  if (password.length < 6) return badRequest(res, 'password must be at least 6 characters');

  const normalizedEmail = email.trim().toLowerCase();
  if (users[normalizedEmail]) return conflict(res, 'email already registered');

  // Accept any of the 3 legacy source values (or default)
  const resolvedSource = VALID_SOURCES.has(source) ? source : 'aoe-unified';

  const salt         = generateSalt();
  const passwordHash = hashPassword(password, salt);
  const userId       = generateUserId();

  const user = {
    id:           userId,
    email:        normalizedEmail,
    passwordHash,
    salt,
    source:       resolvedSource,
    createdAt:    new Date().toISOString(),
    referralCode: generateReferralCode(),  // each user gets their own referral code
  };

  users[normalizedEmail] = user;
  persistUsers();

  // Create referral entry for the new user's own code
  referrals[user.referralCode] = {
    code:      user.referralCode,
    ownerId:   userId,
    uses:      [],
    createdAt: new Date().toISOString(),
  };

  // If a referral code was provided, record the claim automatically at registration
  if (referralCode && referrals[referralCode] && referrals[referralCode].ownerId !== userId) {
    referrals[referralCode].uses.push({
      claimedBy: userId,
      claimedAt: new Date().toISOString(),
    });
  }

  persistReferrals();

  const { token, exp } = issueToken(userId, resolvedSource);

  created(res, {
    status:       'registered',
    userId,
    email:        normalizedEmail,
    source:       resolvedSource,
    referralCode: user.referralCode,
    token,
    expiresAt:    new Date(exp).toISOString(),
    ts:           Date.now(),
  });
}

/**
 * POST /auth/login
 * Body: { email, password, source? }
 */
async function handleLogin(req, res) {
  const body = await readBody(req);
  const { email, password, source } = body;

  if (!email || !password) return badRequest(res, 'email and password are required');

  const normalizedEmail = email.trim().toLowerCase();
  const user = users[normalizedEmail];

  if (!user) return unauthorized(res, 'Invalid credentials');

  const hash = hashPassword(password, user.salt);
  if (hash !== user.passwordHash) return unauthorized(res, 'Invalid credentials');

  // Accept login from any of the 3 legacy sources
  const resolvedSource = VALID_SOURCES.has(source) ? source : user.source;

  const { token, jti, exp } = issueToken(user.id, resolvedSource);

  ok(res, {
    status:    'authenticated',
    userId:    user.id,
    email:     normalizedEmail,
    source:    resolvedSource,
    token,
    tokenId:   jti,
    expiresAt: new Date(exp).toISOString(),
    ts:        Date.now(),
  });
}

/**
 * POST /auth/logout
 * Header: Authorization: Bearer <token>
 */
async function handleLogout(req, res) {
  const raw = extractBearerToken(req);
  if (!raw) return badRequest(res, 'Bearer token required');

  const payload = verifyToken(raw);
  if (!payload) return unauthorized(res, 'Token invalid or already expired');

  revokedTokens.add(payload.jti);

  ok(res, { status: 'logged_out', tokenId: payload.jti, ts: Date.now() });
}

/**
 * GET /auth/verify
 * Header: Authorization: Bearer <token>
 */
async function handleVerify(req, res) {
  const raw = extractBearerToken(req);
  if (!raw) return badRequest(res, 'Bearer token required');

  const payload = verifyToken(raw);
  if (!payload) return unauthorized(res, 'Token invalid, expired, or revoked');

  const user = Object.values(users).find(u => u.id === payload.sub);

  ok(res, {
    valid:     true,
    userId:    payload.sub,
    email:     user ? user.email : null,
    source:    payload.src,
    issuedAt:  new Date(payload.iat).toISOString(),
    expiresAt: new Date(payload.exp).toISOString(),
    ts:        Date.now(),
  });
}

/**
 * POST /referral/claim
 * Header: Authorization: Bearer <token>  (optional but preferred)
 * Body:   { code, claimedBy? }  — claimedBy is userId; falls back to token sub
 */
async function handleReferralClaim(req, res) {
  const body = await readBody(req);
  const { code, source } = body;

  if (!code || typeof code !== 'string') return badRequest(res, 'referral code is required');

  const normalizedCode = code.trim().toUpperCase();
  if (!referrals[normalizedCode]) return badRequest(res, 'Referral code not found');

  // Determine claimer
  let claimerId = body.claimedBy || null;
  const raw = extractBearerToken(req);
  if (!claimerId && raw) {
    const payload = verifyToken(raw);
    if (payload) claimerId = payload.sub;
  }

  if (!claimerId) return badRequest(res, 'claimedBy userId or valid Bearer token required');

  const ref = referrals[normalizedCode];

  // Prevent self-referral
  if (ref.ownerId === claimerId) return badRequest(res, 'Cannot claim your own referral code');

  // Prevent duplicate claims by same user
  const alreadyClaimed = ref.uses.some(u => u.claimedBy === claimerId);
  if (alreadyClaimed) return conflict(res, 'Referral code already claimed by this user');

  ref.uses.push({
    claimedBy: claimerId,
    claimedAt: new Date().toISOString(),
    source:    VALID_SOURCES.has(source) ? source : 'aoe-unified',
  });

  persistReferrals();

  ok(res, {
    status:    'claimed',
    code:      normalizedCode,
    ownerId:   ref.ownerId,
    claimedBy: claimerId,
    totalUses: ref.uses.length,
    ts:        Date.now(),
  });
}

/**
 * GET /referral/stats
 * Query: ?ownerId=<userId>   (optional filter)
 * Header: Authorization: Bearer <token>  (optional)
 */
async function handleReferralStats(req, res) {
  const reqUrl   = new URL(req.url, `http://localhost:${PORT}`);
  const ownerId  = reqUrl.searchParams.get('ownerId') || null;

  // If a token is provided, allow scoping to the token's own stats
  let tokenOwnerId = null;
  const raw = extractBearerToken(req);
  if (raw) {
    const payload = verifyToken(raw);
    if (payload) tokenOwnerId = payload.sub;
  }

  const effectiveOwnerId = ownerId || tokenOwnerId;

  const allCodes = Object.values(referrals);
  const scoped   = effectiveOwnerId
    ? allCodes.filter(r => r.ownerId === effectiveOwnerId)
    : allCodes;

  const stats = scoped.map(r => ({
    code:      r.code,
    ownerId:   r.ownerId,
    totalUses: r.uses.length,
    uses:      r.uses,
    createdAt: r.createdAt,
  }));

  ok(res, {
    totalCodes: stats.length,
    totalClaims: stats.reduce((acc, s) => acc + s.totalUses, 0),
    filteredBy: effectiveOwnerId || 'all',
    codes:      stats,
    ts:         Date.now(),
  });
}

// ── ROUTER ────────────────────────────────────────────────────────────────────

async function router(req, res) {
  // CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Strip query string for route matching
  const pathname = req.url.split('?')[0].replace(/\/+$/, '') || '/';
  const method   = req.method.toUpperCase();

  try {
    if (method === 'POST' && pathname === '/auth/register')  return await handleRegister(req, res);
    if (method === 'POST' && pathname === '/auth/login')     return await handleLogin(req, res);
    if (method === 'POST' && pathname === '/auth/logout')    return await handleLogout(req, res);
    if (method === 'GET'  && pathname === '/auth/verify')    return await handleVerify(req, res);
    if (method === 'POST' && pathname === '/referral/claim') return await handleReferralClaim(req, res);
    if (method === 'GET'  && pathname === '/referral/stats') return await handleReferralStats(req, res);

    // Health check
    if (method === 'GET' && (pathname === '/health' || pathname === '/')) {
      return ok(res, {
        service:  'auth-service',
        agent:    'Agent-5A',
        status:   'ok',
        port:     PORT,
        sources:  Array.from(VALID_SOURCES),
        users:    Object.keys(users).length,
        referrals: Object.keys(referrals).length,
        endpoints: [
          'POST /auth/register',
          'POST /auth/login',
          'POST /auth/logout',
          'GET  /auth/verify',
          'POST /referral/claim',
          'GET  /referral/stats',
        ],
        ts: Date.now(),
      });
    }

    notFound(res);
  } catch (err) {
    console.error('[auth-service] Unhandled error:', err);
    send(res, 500, { error: 'Internal server error' });
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────────

function init() {
  ensureSharedDir();
  users     = loadJSON(USERS_FILE, {});
  referrals = loadJSON(REFERRALS_FILE, {});

  console.log(`[Agent-5A] auth-service loaded ${Object.keys(users).length} users, ${Object.keys(referrals).length} referral codes`);

  const server = http.createServer(router);

  server.listen(PORT, () => {
    console.log(`[Agent-5A] Unified Auth & Referral Service running on http://localhost:${PORT}`);
    console.log(`[Agent-5A] Auth sources: ${Array.from(VALID_SOURCES).join(', ')}`);
    console.log(`[Agent-5A] Persistence: ${USERS_FILE} | ${REFERRALS_FILE}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Agent-5A] Port ${PORT} already in use. Exiting.`);
      process.exit(1);
    }
    throw err;
  });

  return server;
}

init();
