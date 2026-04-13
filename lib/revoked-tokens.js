'use strict';

/**
 * lib/revoked-tokens.js — Supabase-backed token revocation store
 *
 * Bridges the cold-start revocation gap in Vercel serverless:
 * in-memory Sets (_revokedTokens / blacklistedTokens) are wiped on each cold
 * start, meaning a revoked token can be reused after a new function instance
 * spins up.  This module persists revocations to Supabase so they survive
 * restarts and are shared between api/index.js (Vercel) and auth.js (VPS).
 *
 * Only /auth/me (the auth-guard validation endpoint) performs a Supabase
 * check.  Inlined API-route guards still use the in-memory Set (fast path).
 *
 * Required Supabase table — run once in your Supabase SQL editor:
 *
 *   CREATE TABLE IF NOT EXISTS revoked_tokens (
 *     token       TEXT PRIMARY KEY,
 *     expires_at  TIMESTAMPTZ NOT NULL,
 *     created_at  TIMESTAMPTZ DEFAULT NOW()
 *   );
 *   CREATE INDEX IF NOT EXISTS idx_revoked_tokens_exp
 *     ON revoked_tokens(expires_at);
 */

const { supabase } = require('./supabase');

const TABLE = 'revoked_tokens';
// Default TTL if caller doesn't supply an expiry (matches longest token lifetime)
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Persist a token revocation to Supabase.
 * expiresAt — ISO string; defaults to 7 days from now.
 */
async function revoke(token, expiresAt) {
  if (!supabase || !token) return;
  try {
    const exp = expiresAt || new Date(Date.now() + DEFAULT_TTL_MS).toISOString();
    await supabase.from(TABLE).upsert({ token, expires_at: exp }, { onConflict: 'token' });
  } catch (_) {
    // Non-fatal — in-memory set is still the fast-path guard
  }
}

/**
 * Check whether a token has been persistently revoked.
 * Returns false on any DB error (fail-open — in-memory set is still checked by callers).
 */
async function isRevoked(token) {
  if (!supabase || !token) return false;
  try {
    const { data } = await supabase
      .from(TABLE)
      .select('token')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    return !!data;
  } catch (_) {
    return false;
  }
}

/**
 * Delete expired rows.  Call from a cron or lazily — not required for correctness.
 */
async function cleanup() {
  if (!supabase) return;
  try {
    await supabase.from(TABLE).delete().lt('expires_at', new Date().toISOString());
  } catch (_) {}
}

module.exports = { revoke, isRevoked, cleanup };
