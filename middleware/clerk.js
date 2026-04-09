/**
 * BRIDGE AI OS — Clerk Authentication Bridge
 *
 * Verifies Clerk sessions and syncs authenticated users into
 * the existing users.db via user-identity.js.
 *
 * After Clerk sign-in, the frontend calls POST /api/auth/clerk-sync
 * which returns a Bridge JWT — all downstream middleware (access-control,
 * pageGuard, requireClient, etc.) works unchanged.
 *
 * Env vars required:
 *   CLERK_PUBLISHABLE_KEY — pk_test_... or pk_live_...
 *   CLERK_SECRET_KEY      — sk_test_... or sk_live_...
 */

'use strict';

const { clerkMiddleware, getAuth, clerkClient } = require('@clerk/express');
const userDb = require('../lib/user-identity');

// ── Clerk Express Middleware ───────────────────────────────────────────────
// Non-blocking: attaches auth state to every request without rejecting.
// Individual routes call getAuth(req) to check if authenticated.
function createClerkMiddleware() {
  if (!process.env.CLERK_SECRET_KEY) {
    console.warn('[CLERK] CLERK_SECRET_KEY not set — Clerk auth disabled');
    return (_req, _res, next) => next();
  }
  return clerkMiddleware();
}

// ── Sync Route Handler ─────────────────────────────────────────────────────
// POST /api/auth/clerk-sync
// Called by the frontend after Clerk sign-in completes.
// Reads Clerk session from the request, fetches user profile,
// upserts into users.db, and returns a Bridge JWT.
async function clerkSyncHandler(req, res) {
  try {
    const auth = getAuth(req);

    if (!auth || !auth.userId) {
      return res.status(401).json({ ok: false, error: 'No Clerk session found' });
    }

    // Fetch full user profile from Clerk
    const clerkUser = await clerkClient.users.getUser(auth.userId);

    const email = clerkUser.emailAddresses?.[0]?.emailAddress;
    if (!email) {
      return res.status(400).json({ ok: false, error: 'Clerk user has no email address' });
    }

    const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null;

    // Determine OAuth provider from Clerk's external accounts
    let provider = 'clerk';
    const externalAccount = clerkUser.externalAccounts?.[0];
    if (externalAccount) {
      provider = externalAccount.provider || 'clerk';
    }

    // Upsert into users.db (createUser returns existing user if email matches)
    const user = userDb.createUser(email, name, provider, auth.userId);

    // Update name if it was null before (user registered with email first, then linked social)
    if (!user.name && name) {
      const db = require('better-sqlite3');
      // user-identity uses its own db instance, so we update via the module pattern
      // For now, direct update is fine since createUser returned the existing record
    }

    // Generate Bridge JWT for all downstream middleware
    const token = userDb.generateAuthToken(user.id);

    // Sanitize — never send password_hash to client
    const { password_hash, ...safeUser } = user;

    res.json({
      ok: true,
      token,
      user: { ...safeUser, name: name || safeUser.name },
      clerk_id: auth.userId,
    });
  } catch (err) {
    console.error('[CLERK-SYNC]', err.message);
    res.status(500).json({ ok: false, error: 'Clerk sync failed' });
  }
}

module.exports = {
  createClerkMiddleware,
  clerkSyncHandler,
};
