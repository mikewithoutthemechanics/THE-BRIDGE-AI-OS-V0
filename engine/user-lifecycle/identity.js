// =============================================================================
// BRIDGE AI OS — ULOE Identity Engine
//
// Owns user profile construction, updates, verification, and wallet linking.
// Wraps lib/user-identity.js with lifecycle event emission + canonical envelopes.
// =============================================================================
'use strict';

const { supabase }          = require('../../lib/supabase');
const history               = require('./history');
const { ok, fail, EVENTS, uuid } = require('./schemas');

const OP = {
  CREATE:        'identity.create',
  UPDATE:        'identity.update',
  GET:           'identity.get',
  LINK_WALLET:   'identity.link_wallet',
  VERIFY_EMAIL:  'identity.verify_email',
  SET_TYPE:      'identity.set_type',
};

// ── Create user ───────────────────────────────────────────────────────────────
async function createUser({ email, name, source = 'email', walletAddress = null, metadata = {} }) {
  const correlationId = uuid();

  try {
    // Check for existing user by email
    const { data: existing } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existing) {
      return fail(OP.CREATE, existing.id, 'User already exists with this email', {
        meta: { user_id: existing.id },
      });
    }

    const userId = uuid();
    const now    = new Date().toISOString();

    const userRecord = {
      id:             userId,
      email:          email.toLowerCase().trim(),
      name:           name || null,
      source,
      wallet_address: walletAddress ? walletAddress.toLowerCase() : null,
      funnel_stage:   'prospect',
      user_type:      'personal',
      plan:           'free',
      verified:       false,
      metadata:       { ...metadata, created_at: now },
      created_at:     now,
      updated_at:     now,
    };

    const { error } = await supabase.from('users').insert(userRecord);
    if (error) throw new Error(error.message);

    const eventLogged = await history.append({
      userId,
      category:      'identity',
      action:        EVENTS.IDENTITY.CREATED,
      actor:         source,
      details:       { email: userRecord.email, name, source, has_wallet: !!walletAddress },
      correlationId,
    });

    return ok(OP.CREATE, userId, {
      affected_files: ['profile.json'],
      state_changes:  { 'profile.json': { id: userId, email: userRecord.email, plan: 'free' } },
      event_logged:   eventLogged,
      next_actions:   ['subscription.create', 'wallet.initialize', 'module.activate_defaults'],
    });

  } catch (err) {
    return fail(OP.CREATE, null, err.message);
  }
}

// ── Get user ──────────────────────────────────────────────────────────────────
async function getUser(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) return fail(OP.GET, userId, 'User not found');
  return ok(OP.GET, userId, { meta: data });
}

// ── Update profile ────────────────────────────────────────────────────────────
async function updateProfile(userId, updates) {
  const allowed = ['name', 'phone', 'company', 'country', 'timezone', 'metadata'];
  const filtered = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) filtered[key] = updates[key];
  }
  if (Object.keys(filtered).length === 0) {
    return fail(OP.UPDATE, userId, 'No allowed fields provided');
  }

  filtered.updated_at = new Date().toISOString();

  const { error } = await supabase.from('users').update(filtered).eq('id', userId);
  if (error) return fail(OP.UPDATE, userId, error.message);

  const eventLogged = await history.append({
    userId,
    category: 'identity',
    action:   EVENTS.IDENTITY.UPDATED,
    details:  { fields: Object.keys(filtered) },
  });

  return ok(OP.UPDATE, userId, {
    affected_files: ['profile.json'],
    state_changes:  { 'profile.json': filtered },
    event_logged:   eventLogged,
    next_actions:   [],
  });
}

// ── Link wallet ───────────────────────────────────────────────────────────────
async function linkWallet(userId, walletAddress) {
  const normalized = walletAddress.toLowerCase();

  // Check if already taken by another user
  const { data: conflict } = await supabase
    .from('users')
    .select('id')
    .eq('wallet_address', normalized)
    .neq('id', userId)
    .single();

  if (conflict) return fail(OP.LINK_WALLET, userId, 'Wallet already linked to another account');

  const { error } = await supabase
    .from('users')
    .update({ wallet_address: normalized, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) return fail(OP.LINK_WALLET, userId, error.message);

  const eventLogged = await history.append({
    userId,
    category: 'identity',
    action:   EVENTS.IDENTITY.WALLET_LINKED,
    details:  { wallet_address: normalized },
  });

  return ok(OP.LINK_WALLET, userId, {
    affected_files: ['profile.json'],
    state_changes:  { 'profile.json': { wallet_address: normalized } },
    event_logged:   eventLogged,
    next_actions:   ['wallet.initialize_brdg'],
  });
}

// ── Verify email ──────────────────────────────────────────────────────────────
async function verifyEmail(userId) {
  const { error } = await supabase
    .from('users')
    .update({ verified: true, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) return fail(OP.VERIFY_EMAIL, userId, error.message);

  const eventLogged = await history.append({
    userId,
    category: 'identity',
    action:   EVENTS.IDENTITY.VERIFIED,
    details:  { method: 'email' },
  });

  return ok(OP.VERIFY_EMAIL, userId, {
    affected_files: ['profile.json'],
    state_changes:  { 'profile.json': { verified: true } },
    event_logged:   eventLogged,
    next_actions:   ['subscription.check_trial'],
  });
}

// ── Set user type (personal / business) ───────────────────────────────────────
async function setUserType(userId, userType) {
  if (!['personal', 'business'].includes(userType)) {
    return fail(OP.SET_TYPE, userId, 'Invalid user_type — must be personal or business');
  }

  const { error } = await supabase
    .from('users')
    .update({ user_type: userType, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) return fail(OP.SET_TYPE, userId, error.message);

  const eventLogged = await history.append({
    userId,
    category: 'identity',
    action:   EVENTS.IDENTITY.UPDATED,
    details:  { field: 'user_type', value: userType },
  });

  return ok(OP.SET_TYPE, userId, {
    affected_files: ['profile.json'],
    state_changes:  { 'profile.json': { user_type: userType } },
    event_logged:   eventLogged,
    next_actions:   userType === 'business' ? ['subscription.apply_business_limits'] : [],
  });
}

// ── Find by wallet ────────────────────────────────────────────────────────────
async function findByWallet(walletAddress) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('wallet_address', walletAddress.toLowerCase())
    .single();

  if (error || !data) return null;
  return data;
}

// ── Find by email ─────────────────────────────────────────────────────────────
async function findByEmail(email) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (error || !data) return null;
  return data;
}

module.exports = {
  createUser, getUser, updateProfile, linkWallet,
  verifyEmail, setUserType, findByWallet, findByEmail,
};
