/**
 * BRIDGE AI OS — User Identity & Funnel Management
 *
 * Persistent user store for authentication, funnel tracking, and nurture pipeline.
 * Uses Supabase (PostgreSQL) via the shared client in ./supabase.js.
 *
 * Tables:
 *   users — full user profile, funnel stage, lead score, journey data
 *
 * Usage:
 *   const userDb = require('./lib/user-identity');
 *   await userDb.createUser('user@example.com', 'Jane', 'email', null);
 *   await userDb.updateFunnelStage(userId, 'qualified');
 *   await userDb.getFunnelStats();
 *
 * NOTE: All database functions are async (return Promises). Callers must await them.
 *       JWT/HMAC and password functions remain synchronous.
 */

'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { supabase, isConfigured } = require('./supabase');

if (!isConfigured) {
  console.error('[USER-IDENTITY] Supabase not configured — user operations will fail.');
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || process.env.BRIDGE_SIWE_JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[FATAL] No JWT_SECRET or BRIDGE_SIWE_JWT_SECRET set. Auth will not work.');
}
// Generate a random fallback per process — tokens won't survive restarts, but at least they're not predictable
const JWT_SIGNING_KEY = JWT_SECRET || crypto.randomBytes(32).toString('hex');

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 12);
}

/**
 * Verify password against stored hash. Supports bcrypt and legacy SHA-256.
 * Returns { valid: boolean, needsRehash: boolean }.
 * Call upgradePasswordHash() after successful login if needsRehash is true.
 */
function verifyPassword(password, stored) {
  if (!stored) return false;
  // Support legacy SHA-256 format (salt:hash) — flag for upgrade
  if (stored.includes(':') && stored.length === 97) {
    const [salt, hash] = stored.split(':');
    const check = crypto.createHash('sha256').update(salt + password).digest('hex');
    if (check === hash) {
      // Mark for rehash — caller should call upgradePasswordHash()
      return true;
    }
    return false;
  }
  return bcrypt.compareSync(password, stored);
}

function needsRehash(stored) {
  if (!stored) return false;
  return stored.includes(':') && stored.length === 97;
}

async function upgradePasswordHash(userId, plaintext) {
  const newHash = hashPassword(plaintext);
  const { error } = await supabase
    .from('users')
    .update({ password_hash: newHash })
    .eq('id', userId);
  if (error) console.warn('[USER-IDENTITY] Failed to upgrade password hash:', error.message);
}

function now() {
  return new Date().toISOString();
}

// ── Encryption for sensitive fields (TOTP backup codes) ────────────────────
const ENCRYPTION_KEY = process.env.TOTP_ENCRYPTION_KEY || JWT_SIGNING_KEY;
const ALGO = 'aes-256-gcm';

function encryptField(plaintext) {
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  let enc = cipher.update(plaintext, 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + tag + ':' + enc;
}

function decryptField(ciphertext) {
  if (!ciphertext || !ciphertext.includes(':')) return ciphertext;
  try {
    const [ivHex, tagHex, enc] = ciphertext.split(':');
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let dec = decipher.update(enc, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch (_) {
    // Fallback: might be unencrypted legacy data
    return ciphertext;
  }
}

/**
 * Throw a descriptive error when a Supabase query fails.
 */
function throwIfError(error, context) {
  if (error) {
    const msg = `[USER-IDENTITY] ${context}: ${error.message || JSON.stringify(error)}`;
    console.error(msg);
    throw new Error(msg);
  }
}

// ── User CRUD ───────────────────────────────────────────────────────────────

async function createUser(email, name, provider, oauthId, passwordRaw) {
  if (!email) throw new Error('Email is required');
  email = email.toLowerCase().trim();

  // Return existing user if found
  const { data: existing, error: selErr } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  // PGRST116 = "no rows returned" — not a real error, just means user doesn't exist
  if (existing && !selErr) return existing;
  if (selErr && selErr.code !== 'PGRST116') throwIfError(selErr, 'createUser lookup');

  const id = uuid();
  const ts = now();
  const apiKey = 'brdg_' + crypto.randomBytes(24).toString('hex');
  const passwordHash = passwordRaw ? hashPassword(passwordRaw) : null;
  const referralCode = 'REF-' + crypto.randomBytes(5).toString('hex').toUpperCase();

  const { data, error } = await supabase
    .from('users')
    .insert({
      id,
      email,
      name: name || null,
      oauth_provider: provider || 'email',
      oauth_id: oauthId || null,
      password_hash: passwordHash,
      api_key: apiKey,
      referral_code: referralCode,
      first_seen: ts,
      last_seen: ts,
      plan: 'visitor',
      funnel_stage: 'visitor',
      lead_score: 0,
      brdg_balance: 0,
      pain_points: [],
      pages_visited: [],
      conversations: 0,
      role: 'user',
      totp_enabled: false,
    })
    .select()
    .single();

  throwIfError(error, 'createUser insert');
  return data;
}

async function getUserByEmail(email) {
  if (!email) return null;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (error && error.code === 'PGRST116') return null;
  throwIfError(error, 'getUserByEmail');
  return data || null;
}

async function getUserById(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code === 'PGRST116') return null;
  throwIfError(error, 'getUserById');
  return data || null;
}

async function getUserByApiKey(apiKey) {
  if (!apiKey) return null;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('api_key', apiKey)
    .single();

  if (error && error.code === 'PGRST116') return null;
  throwIfError(error, 'getUserByApiKey');
  return data || null;
}

async function updateUser(userId, fields) {
  const allowed = ['name', 'company', 'oauth_provider', 'oauth_id', 'plan', 'funnel_stage', 'role'];
  const updates = {};
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k) && v !== undefined) {
      updates[k] = v;
    }
  }
  if (Object.keys(updates).length === 0) return getUserById(userId);

  updates.last_seen = now();

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  throwIfError(error, 'updateUser');
  return data;
}

// ── Funnel & Lead Scoring ───────────────────────────────────────────────────

const FUNNEL_ORDER = ['visitor', 'lead', 'qualified', 'opportunity', 'customer', 'advocate'];

async function updateFunnelStage(userId, stage) {
  if (!FUNNEL_ORDER.includes(stage)) throw new Error('Invalid funnel stage: ' + stage);

  const { data, error } = await supabase
    .from('users')
    .update({ funnel_stage: stage, last_seen: now() })
    .eq('id', userId)
    .select()
    .single();

  throwIfError(error, 'updateFunnelStage');
  return data;
}

async function updateLeadScore(userId, delta) {
  const d = parseInt(delta, 10) || 0;

  // Fetch current score, compute new value (floor at 0), then update
  const user = await getUserById(userId);
  if (!user) return null;

  const newScore = Math.max(0, (user.lead_score || 0) + d);

  const { data, error } = await supabase
    .from('users')
    .update({ lead_score: newScore, last_seen: now() })
    .eq('id', userId)
    .select()
    .single();

  throwIfError(error, 'updateLeadScore');
  return data;
}

async function recordPageVisit(userId, page) {
  const user = await getUserById(userId);
  if (!user) return null;

  let pages = [];
  try {
    // jsonb columns come back as arrays/objects from Supabase, but handle string legacy too
    pages = Array.isArray(user.pages_visited)
      ? user.pages_visited
      : JSON.parse(user.pages_visited || '[]');
  } catch (_) {}

  if (!pages.includes(page)) pages.push(page);

  const { error } = await supabase
    .from('users')
    .update({ pages_visited: pages, last_page: page, last_seen: now() })
    .eq('id', userId);

  throwIfError(error, 'recordPageVisit');

  // Auto-increment score for page visits
  await updateLeadScore(userId, 3);
  return getUserById(userId);
}

async function recordConversation(userId) {
  const user = await getUserById(userId);
  if (!user) return null;

  const { error } = await supabase
    .from('users')
    .update({ conversations: (user.conversations || 0) + 1, last_seen: now() })
    .eq('id', userId);

  throwIfError(error, 'recordConversation');

  // Conversations are high-intent signals
  await updateLeadScore(userId, 5);
  return getUserById(userId);
}

async function setUserPlan(userId, plan) {
  const { data, error } = await supabase
    .from('users')
    .update({ plan, last_seen: now() })
    .eq('id', userId)
    .select()
    .single();

  throwIfError(error, 'setUserPlan');
  return data;
}

async function setUserRole(userId, role) {
  const validRoles = ['user', 'admin', 'superadmin'];
  if (!validRoles.includes(role)) throw new Error('Invalid role: ' + role);

  const { data, error } = await supabase
    .from('users')
    .update({ role, last_seen: now() })
    .eq('id', userId)
    .select()
    .single();

  throwIfError(error, 'setUserRole');
  return data;
}

// ── Auth Tokens (HMAC-SHA256 JWT-like) ──────────────────────────────────────
// These are LOCAL crypto operations — they sign/verify tokens but need async
// getUserById for payload enrichment.

async function generateAuthToken(userId) {
  const user = await getUserById(userId);
  const payload = {
    sub: userId,
    role: (user && user.role) || 'user',
    plan: (user && user.plan) || 'visitor',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 * 7, // 7 days
  };
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SIGNING_KEY).update(header + '.' + body).digest('base64url');
  return header + '.' + body + '.' + sig;
}

async function verifyAuthToken(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', JWT_SIGNING_KEY).update(header + '.' + body).digest('base64url');
    if (sig !== expectedSig) return null;

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return await getUserById(payload.sub);
  } catch (_) {
    return null;
  }
}

// ── Admin / Analytics ───────────────────────────────────────────────────────

async function getAllUsers(filters) {
  let query = supabase.from('users').select('*');

  if (filters && filters.funnel_stage) {
    query = query.eq('funnel_stage', filters.funnel_stage);
  }

  query = query.order('last_seen', { ascending: false });

  const { data, error } = await query;
  throwIfError(error, 'getAllUsers');
  return data || [];
}

async function getFunnelStats() {
  // Fetch all users' funnel stages
  const { data: users, error } = await supabase
    .from('users')
    .select('funnel_stage');

  throwIfError(error, 'getFunnelStats');

  const stageMap = {};
  for (const s of FUNNEL_ORDER) stageMap[s] = 0;
  for (const u of (users || [])) {
    const stage = u.funnel_stage || 'visitor';
    if (stageMap[stage] !== undefined) stageMap[stage]++;
    else stageMap[stage] = 1;
  }

  const total = (users || []).length;

  // Conversion rates between adjacent stages
  const conversions = {};
  for (let i = 0; i < FUNNEL_ORDER.length - 1; i++) {
    const from = FUNNEL_ORDER[i];
    const to = FUNNEL_ORDER[i + 1];
    const fromCount = stageMap[from] || 0;
    const toCount = stageMap[to] || 0;
    conversions[from + '_to_' + to] = fromCount > 0 ? ((toCount / fromCount) * 100).toFixed(1) + '%' : '0%';
  }

  return { total, stages: stageMap, conversions };
}

async function getNurtureQueue() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .in('funnel_stage', ['lead', 'qualified'])
    .or(`last_seen.lt.${cutoff},last_seen.is.null`)
    .order('lead_score', { ascending: false });

  throwIfError(error, 'getNurtureQueue');
  return data || [];
}

// ── MFA / TOTP Persistence ─────────────────────────────────────────────────

async function setTotpSecret(userId, secret, backupCodes) {
  const { data, error } = await supabase
    .from('users')
    .update({
      totp_secret: encryptField(secret),
      totp_backup_codes: encryptField(JSON.stringify(backupCodes)),
      totp_enabled: false,
      last_seen: now(),
    })
    .eq('id', userId)
    .select()
    .single();

  throwIfError(error, 'setTotpSecret');
  return data;
}

async function enableTotp(userId) {
  const { data, error } = await supabase
    .from('users')
    .update({ totp_enabled: true, last_seen: now() })
    .eq('id', userId)
    .select()
    .single();

  throwIfError(error, 'enableTotp');
  return data;
}

async function consumeBackupCode(userId, code) {
  const user = await getUserById(userId);
  if (!user || !user.totp_backup_codes) return false;

  let codes = [];
  try {
    const raw = typeof user.totp_backup_codes === 'string'
      ? decryptField(user.totp_backup_codes)
      : JSON.stringify(user.totp_backup_codes);
    codes = JSON.parse(raw);
    if (!Array.isArray(codes)) return false;
  } catch (_) {
    return false;
  }

  if (!codes.includes(code)) return false;
  codes = codes.filter(c => c !== code);

  const { error } = await supabase
    .from('users')
    .update({ totp_backup_codes: encryptField(JSON.stringify(codes)), last_seen: now() })
    .eq('id', userId);

  throwIfError(error, 'consumeBackupCode');
  return true;
}

async function getTotpData(userId) {
  const user = await getUserById(userId);
  if (!user) return null;

  // Decrypt TOTP secret
  const totpSecret = user.totp_secret ? decryptField(user.totp_secret) : null;

  // Decrypt backup codes
  let backupCodes = [];
  try {
    const raw = typeof user.totp_backup_codes === 'string'
      ? decryptField(user.totp_backup_codes)
      : JSON.stringify(user.totp_backup_codes || '[]');
    backupCodes = JSON.parse(raw);
    if (!Array.isArray(backupCodes)) backupCodes = [];
  } catch (_) {}

  return {
    secret: totpSecret,
    enabled: !!user.totp_enabled,
    backup_codes: backupCodes,
  };
}

// ── Wallet Identity (Crypto Address Linking) ───────────────────────────────────

/**
 * Link a crypto wallet address to a user
 * @param {string} userId - User ID
 * @param {string} walletAddress - Crypto address (will be lowercased)
 * @param {string} chain - Blockchain ('ethereum', 'linea', 'solana', etc)
 * @param {string} verificationSig - Optional signature proof of ownership
 * @returns {object} wallet_identity row
 */
async function linkWallet(userId, walletAddress, chain = 'ethereum', verificationSig = null) {
  if (!userId || !walletAddress) throw new Error('userId and walletAddress required');

  const { data, error } = await supabase
    .from('wallet_identities')
    .insert({
      user_id: userId,
      wallet_address: walletAddress.toLowerCase(),
      chain,
      verified_at: now(),
      verification_signature: verificationSig,
    })
    .select()
    .single();

  throwIfError(error, 'linkWallet');
  return data;
}

/**
 * Get all wallets linked to a user
 * @param {string} userId - User ID
 * @returns {array} wallet_identity rows
 */
async function getUserWallets(userId) {
  const { data, error } = await supabase
    .from('wallet_identities')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  throwIfError(error, 'getUserWallets');
  return data || [];
}

/**
 * Unlink a wallet from a user
 * @param {string} userId - User ID
 * @param {string} walletAddress - Wallet address to remove
 * @returns {boolean} success
 */
async function unlinkWallet(userId, walletAddress) {
  const { error } = await supabase
    .from('wallet_identities')
    .delete()
    .eq('user_id', userId)
    .eq('wallet_address', walletAddress.toLowerCase());

  throwIfError(error, 'unlinkWallet');
  return true;
}

/**
 * Find user by wallet address
 * @param {string} walletAddress - Crypto address
 * @param {string} chain - Blockchain ('ethereum', 'linea', etc)
 * @returns {object} user row or null
 */
async function getUserByWallet(walletAddress, chain = 'ethereum') {
  if (!walletAddress) return null;

  const { data, error } = await supabase
    .from('wallet_identities')
    .select('user_id')
    .eq('wallet_address', walletAddress.toLowerCase())
    .eq('chain', chain)
    .single();

  if (error && error.code === 'PGRST116') return null;
  throwIfError(error, 'getUserByWallet');

  if (data && data.user_id) return getUserById(data.user_id);
  return null;
}

// ── Exports ─────────────────────────────────────────────────────────────────
module.exports = {
  createUser,
  getUserByEmail,
  getUserById,
  getUserByApiKey,
  updateUser,
  updateFunnelStage,
  updateLeadScore,
  recordPageVisit,
  recordConversation,
  setUserPlan,
  setUserRole,
  generateAuthToken,
  verifyAuthToken,
  getAllUsers,
  getFunnelStats,
  getNurtureQueue,
  hashPassword,
  verifyPassword,
  needsRehash,
  upgradePasswordHash,
  FUNNEL_ORDER,
  setTotpSecret,
  enableTotp,
  consumeBackupCode,
  getTotpData,
  linkWallet,
  getUserWallets,
  unlinkWallet,
  getUserByWallet,
};
