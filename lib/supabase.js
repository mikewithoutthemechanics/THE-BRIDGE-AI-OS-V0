/**
 * BRIDGE AI OS — Supabase Client (shared singleton)
 *
 * Every module that needs the database imports this instead of better-sqlite3.
 * Exports both a service-role client (server-side, bypasses RLS) and
 * an anon client (for RLS-scoped queries if needed).
 *
 * Env vars:
 *   SUPABASE_URL          — https://<ref>.supabase.co
 *   SUPABASE_SERVICE_KEY  — service_role key (server-side only)
 *   SUPABASE_ANON_KEY     — anon/publishable key (optional)
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

const isConfigured = !!(SUPABASE_URL && SUPABASE_SERVICE_KEY);

if (!isConfigured) {
  console.error('[SUPABASE] SUPABASE_URL or SUPABASE_SERVICE_KEY missing — DB operations will fail.');
}

let supabase = null;
let supabaseAnon = null;

try {
  if (isConfigured) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
} catch (err) {
  console.error('[SUPABASE] Failed to initialize client:', err.message);
}

module.exports = { supabase, supabaseAnon, isConfigured, SUPABASE_URL };
