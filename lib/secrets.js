'use strict';

/**
 * secrets.js — Secrets manager backed by Supabase
 * Reads/writes secrets from secrets_vault table in Supabase
 * Falls back to env vars if secret not found in DB or DB unavailable
 * 5-minute in-memory cache for performance
 */

const { supabase } = require('./supabase');

// ===== CACHE =====
const cache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get a secret by key name (synchronous — cache or env only).
 * For Supabase-backed lookup, use getSecretAsync().
 * Priority: cache -> env var -> fallback
 */
function getSecret(keyName, fallback = null) {
  const cacheKey = keyName.toUpperCase();
  const now = Date.now();

  // Check cache
  if (cache[cacheKey] && (now - cache[cacheKey].ts) < CACHE_TTL) {
    return cache[cacheKey].value;
  }

  // Fallback to env var
  const envVal = process.env[cacheKey] || process.env[keyName];
  if (envVal) return envVal;

  return fallback;
}

/**
 * Get a secret by key name (async — checks Supabase first).
 */
async function getSecretAsync(keyName, fallback = null) {
  const cacheKey = keyName.toUpperCase();
  const now = Date.now();

  // Check cache
  if (cache[cacheKey] && (now - cache[cacheKey].ts) < CACHE_TTL) {
    return cache[cacheKey].value;
  }

  // Try Supabase
  if (supabase) {
    try {
      const { data } = await supabase
        .from('secrets_vault')
        .select('key_value')
        .eq('key_name', keyName)
        .eq('status', 'active')
        .single();
      if (data && data.key_value) {
        cache[cacheKey] = { value: data.key_value, ts: now };
        return data.key_value;
      }
    } catch (_) {
      // Fall through to env
    }
  }

  // Fallback to env var
  const envVal = process.env[cacheKey] || process.env[keyName];
  if (envVal) return envVal;

  return fallback;
}

/**
 * Set/update a secret
 */
async function setSecret(keyName, keyValue, service = 'API', updatedBy = 'system') {
  // Always cache in memory
  cache[keyName.toUpperCase()] = { value: keyValue, ts: Date.now() };

  if (!supabase) {
    console.warn('[secrets] Supabase not available — cached in memory only for "' + keyName + '"');
    return;
  }

  try {
    await supabase.from('secrets_vault').upsert({
      key_name: keyName,
      key_value: keyValue,
      service: service,
      status: 'active',
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key_name' });
  } catch (err) {
    console.error('[secrets] Failed to persist "' + keyName + '":', err.message);
  }

  // Invalidate cache so next read goes to DB
  delete cache[keyName.toUpperCase()];
}

/**
 * List all secrets (names only, not values — for admin/reporting)
 */
async function listSecrets() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('secrets_vault')
      .select('key_name, service, status, updated_by, updated_at')
      .order('key_name');
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[secrets] listSecrets failed: ' + err.message);
    return [];
  }
}

/**
 * Delete a secret
 */
async function deleteSecret(keyName) {
  if (supabase) {
    try {
      await supabase.from('secrets_vault').delete().eq('key_name', keyName);
    } catch (_) {}
  }
  delete cache[keyName.toUpperCase()];
}

/**
 * Sync secrets from Notion webhook payload
 */
async function syncFromNotion(notionData) {
  const { key_name, key_value, service, status } = notionData;
  if (!key_name || !key_value) return { ok: false, error: 'missing key_name or key_value' };

  if (status === 'revoked') {
    await deleteSecret(key_name);
    return { ok: true, action: 'revoked' };
  }

  await setSecret(key_name, key_value, service || 'API', 'notion-sync');
  return { ok: true, action: 'upserted' };
}

/**
 * Seed initial secrets from .env into DB
 */
async function seedFromEnv(keys) {
  if (!supabase) return 0;
  let count = 0;
  for (const key of keys) {
    const val = process.env[key];
    if (val) {
      try {
        const { data } = await supabase
          .from('secrets_vault')
          .select('key_name')
          .eq('key_name', key)
          .single();
        if (!data) {
          await setSecret(key, val, 'ENV', 'seed');
          count++;
        }
      } catch (_) {}
    }
  }
  return count;
}

module.exports = { getSecret, getSecretAsync, setSecret, listSecrets, deleteSecret, syncFromNotion, seedFromEnv };
