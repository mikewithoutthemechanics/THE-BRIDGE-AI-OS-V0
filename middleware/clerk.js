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

const { clerkMiddleware, getAuth, clerkClient, verifyToken } = require('@clerk/express');
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
    // Extract Bearer token from Authorization header
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    let userId = null;

    // Try Bearer token first (frontend sends session token via header)
    if (bearerToken) {
      try {
        const payload = await verifyToken(bearerToken, {
          secretKey: process.env.CLERK_SECRET_KEY,
        });
        userId = payload.sub;
      } catch (_) {}
    }

    // Fallback to middleware-injected auth (cookie-based)
    if (!userId) {
      const auth = getAuth(req);
      userId = auth?.userId || null;
    }

    if (!userId) {
      return res.status(401).json({ ok: false, error: 'No Clerk session found' });
    }

    // Fetch full user profile from Clerk
    const clerkUser = await clerkClient.users.getUser(userId);

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
    const user = await userDb.createUser(email, name, provider, userId);

    // Update name/oauth if user registered email-first then linked a social account
    if (user && (!user.name && name || !user.oauth_id && userId)) {
      await userDb.updateUser(user.id, {
        ...(name && !user.name ? { name } : {}),
        ...(!user.oauth_id ? { oauth_id: userId, oauth_provider: provider } : {}),
      });
    }

    // Generate Bridge JWT for all downstream middleware
    const token = await userDb.generateAuthToken(user.id);

    // Sanitize — never send password_hash to client
    const { password_hash, ...safeUser } = user;

    res.json({
      ok: true,
      token,
      user: { ...safeUser, name: name || safeUser.name },
      clerk_id: userId,
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
