// =============================================================================
// BRIDGE AI OS — ULOE API Key Engine
//
// Manages API key lifecycle: creation, validation, rotation, revocation.
// Keys are hashed at rest (SHA-256) — the raw key is only returned at creation.
// Rate limiting uses in-memory sliding window per process instance.
// =============================================================================
'use strict';

const crypto       = require('crypto');
const { supabase } = require('../../lib/supabase');
const history      = require('./history');
const { ok, fail, EVENTS, getPlan, uuid } = require('./schemas');

// In-memory sliding window for rate limiting (per process)
const _rateBuckets = new Map(); // key_hash → timestamp[]

function _generateKey() {
  return `brdg_live_${crypto.randomBytes(20).toString('base64url')}`;
}

function _hashKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function _checkRateLimit(keyHash, limitRpm) {
  const now       = Date.now();
  const windowMs  = 60_000;
  let   bucket    = _rateBuckets.get(keyHash) || [];

  // Evict expired entries
  bucket = bucket.filter(ts => ts > now - windowMs);
  _rateBuckets.set(keyHash, bucket);

  if (bucket.length >= limitRpm) return false;
  bucket.push(now);
  return true;
}

// ── Create API key ────────────────────────────────────────────────────────────
async function createKey(userId, {
  plan          = 'starter',
  label         = null,
  expiresInDays = null,
  correlationId = null,
} = {}) {
  const planDef   = getPlan(userId); // gets user's current plan — we use passed plan arg
  const planCfg   = getPlan(plan);
  const rawKey    = _generateKey();
  const keyHash   = _hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 18); // "brdg_live_XXXXXXXX"
  const now       = new Date();
  const expiresAt = expiresInDays
    ? new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  // Check how many keys this user already has (against plan limit)
  const { count } = await supabase
    .from('uloe_api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'active');

  // Get user's plan to enforce key limit
  const { data: user } = await supabase.from('users').select('plan').eq('id', userId).single();
  const userPlan = getPlan(user?.plan || 'free');
  if (userPlan.api_keys > 0 && (count || 0) >= userPlan.api_keys) {
    return fail('api.key_create', userId, `Plan limit reached: max ${userPlan.api_keys} API keys`);
  }

  const record = {
    id:             uuid(),
    user_id:        userId,
    key_hash:       keyHash,
    key_prefix:     keyPrefix,
    plan,
    status:         'active',
    rate_limit_rpm: planCfg.api_rpm,
    credits_balance: planCfg.brdg_bonus,
    total_calls:    0,
    expires_at:     expiresAt,
    label,
    created_at:     now.toISOString(),
    updated_at:     now.toISOString(),
  };

  const { error } = await supabase.from('uloe_api_keys').insert(record);
  if (error) return fail('api.key_create', userId, error.message);

  const eventLogged = await history.append({
    userId,
    category:      'api',
    action:        EVENTS.API.KEY_CREATED,
    details:       { key_id: record.id, key_prefix: keyPrefix, plan, rate_limit_rpm: planCfg.api_rpm },
    correlationId,
  });

  return ok('api.key_create', userId, {
    affected_files: ['api.json'],
    state_changes:  { 'api.json': { active_keys: (count || 0) + 1 } },
    event_logged:   eventLogged,
    next_actions:   [],
    // Raw key returned ONCE — not stored
    meta: { key_id: record.id, raw_key: rawKey, key_prefix: keyPrefix, plan, rate_limit_rpm: planCfg.api_rpm },
  });
}

// ── Validate API key (called on every inbound API request) ────────────────────
async function validateKey(rawKey) {
  const keyHash = _hashKey(rawKey);

  const { data: key, error } = await supabase
    .from('uloe_api_keys')
    .select('*')
    .eq('key_hash', keyHash)
    .eq('status', 'active')
    .single();

  if (error || !key) return { valid: false, reason: 'key_not_found' };

  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    await supabase.from('uloe_api_keys').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', key.id);
    return { valid: false, reason: 'key_expired' };
  }

  if (!_checkRateLimit(keyHash, key.rate_limit_rpm)) {
    // Log rate limit hit asynchronously — don't await to keep response fast
    history.append({
      userId:   key.user_id,
      category: 'api',
      action:   EVENTS.API.RATE_LIMITED,
      details:  { key_id: key.id, key_prefix: key.key_prefix, rpm_limit: key.rate_limit_rpm },
    }).catch(() => {});
    return { valid: false, reason: 'rate_limited', retry_after_ms: 60_000 };
  }

  // Update last_used and total_calls (async — don't block response)
  supabase.from('uloe_api_keys').update({
    last_used_at: new Date().toISOString(),
    total_calls:  key.total_calls + 1,
    updated_at:   new Date().toISOString(),
  }).eq('id', key.id).then(() => {});

  return {
    valid:          true,
    key_id:         key.id,
    user_id:        key.user_id,
    plan:           key.plan,
    rate_limit_rpm: key.rate_limit_rpm,
    credits_balance: key.credits_balance,
  };
}

// ── Revoke key ────────────────────────────────────────────────────────────────
async function revokeKey(userId, keyId, { correlationId } = {}) {
  const { data: key, error: fetchErr } = await supabase
    .from('uloe_api_keys').select('*').eq('id', keyId).eq('user_id', userId).single();

  if (fetchErr || !key) return fail('api.key_revoke', userId, 'Key not found');

  const { error } = await supabase
    .from('uloe_api_keys')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('id', keyId);

  if (error) return fail('api.key_revoke', userId, error.message);

  const eventLogged = await history.append({
    userId,
    category:      'api',
    action:        EVENTS.API.KEY_REVOKED,
    details:       { key_id: keyId, key_prefix: key.key_prefix },
    correlationId,
  });

  return ok('api.key_revoke', userId, {
    event_logged:  eventLogged,
    next_actions:  [],
    meta:          { key_id: keyId },
  });
}

// ── Rotate key (revoke + create new) ─────────────────────────────────────────
async function rotateKey(userId, oldKeyId, { correlationId } = {}) {
  const { data: old } = await supabase
    .from('uloe_api_keys').select('*').eq('id', oldKeyId).eq('user_id', userId).single();

  if (!old) return fail('api.key_rotate', userId, 'Key not found');

  const [revokeResult, newResult] = await Promise.all([
    revokeKey(userId, oldKeyId, { correlationId }),
    createKey(userId, { plan: old.plan, label: old.label ? `${old.label} (rotated)` : null, correlationId }),
  ]);

  if (revokeResult.status === 'failure') return revokeResult;
  if (newResult.status === 'failure')    return newResult;

  await history.append({
    userId,
    category:      'api',
    action:        EVENTS.API.KEY_ROTATED,
    details:       { old_key_id: oldKeyId, new_key_id: newResult.meta.key_id },
    correlationId,
  });

  return ok('api.key_rotate', userId, {
    event_logged: newResult.event_logged,
    next_actions: [],
    meta:         { old_key_id: oldKeyId, new_key: newResult.meta },
  });
}

// ── List keys ─────────────────────────────────────────────────────────────────
async function listKeys(userId) {
  const { data, error } = await supabase
    .from('uloe_api_keys')
    .select('id, key_prefix, plan, status, rate_limit_rpm, credits_balance, total_calls, last_used_at, expires_at, label, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return fail('api.key_list', userId, error.message);
  return ok('api.key_list', userId, { meta: { keys: data, count: data.length } });
}

module.exports = { createKey, validateKey, revokeKey, rotateKey, listKeys };
