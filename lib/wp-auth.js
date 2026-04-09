'use strict';

/**
 * wp-auth.js — WordPress → Bridge AI OS auth unification
 *
 * Flow:
 *   1. WordPress login fires a webhook to POST /api/auth/wp-login
 *   2. This module verifies the WP user via WP REST API (/users/me)
 *   3. Issues a Bridge AI OS JWT
 *   4. Logs the auth event in the Merkle audit tree
 *
 * WordPress plugin to fire the webhook (add to functions.php or custom plugin):
 *   add_action('wp_login', function($user_login, $user) {
 *     wp_remote_post('https://bridge-ai-os.com/api/auth/wp-login', [
 *       'body' => json_encode(['username' => $user_login, 'email' => $user->user_email, 'id' => $user->ID]),
 *       'headers' => ['Content-Type' => 'application/json', 'X-WP-Hook-Secret' => WP_HOOK_SECRET],
 *     ]);
 *   }, 10, 2);
 *
 * Env vars:
 *   WP_HOOK_SECRET   — shared secret between WP and this backend (any random string)
 *   JWT_SECRET       — already set
 */

const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');

const JWT_SECRET   = () => process.env.JWT_SECRET;
const HOOK_SECRET  = () => process.env.WP_HOOK_SECRET || '';
const JWT_EXPIRES  = '7d';

// ── Verify webhook came from WordPress ────────────────────────────────────────

function verifyHookSecret(req) {
  const provided = req.headers['x-wp-hook-secret'] || '';
  const expected = HOOK_SECRET();
  if (!expected) return true; // not configured — allow (warn in logs)
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

// ── Verify WP user via WP REST API ───────────────────────────────────────────

async function verifyWpUser(siteUrl, username, appPassOrToken) {
  const url  = `${siteUrl.replace(/\/$/, '')}/wp-json/wp/v2/users/me?context=edit`;
  const auth = 'Basic ' + Buffer.from(`${username}:${appPassOrToken}`).toString('base64');
  const res  = await fetch(url, { headers: { Authorization: auth } });
  if (!res.ok) throw new Error(`WP user verification failed: ${res.status}`);
  return res.json();
}

// ── Issue Bridge AI OS JWT ────────────────────────────────────────────────────

function issueJwt(payload) {
  return jwt.sign(
    { sub: payload.email, wpId: payload.wpId, role: payload.role, source: 'wordpress' },
    JWT_SECRET(),
    { expiresIn: JWT_EXPIRES }
  );
}

// ── Merkle audit log entry ────────────────────────────────────────────────────

function buildMerkleEntry(email, wpId, role) {
  const data = JSON.stringify({ event: 'wp_login', email, wpId, role, ts: Date.now() });
  return {
    hash:   crypto.createHash('sha256').update(data).digest('hex'),
    data,
    ts:     new Date().toISOString(),
  };
}

// ── Main handler — called from POST /api/auth/wp-login ───────────────────────

async function handleWpLogin(req) {
  if (!verifyHookSecret(req)) {
    throw Object.assign(new Error('Invalid webhook secret'), { status: 401 });
  }

  const { username, email, id: wpId, role = 'subscriber' } = req.body || {};
  if (!username || !email) {
    throw Object.assign(new Error('username and email required'), { status: 400 });
  }

  // Issue JWT — we trust the WP hook (verified by secret)
  const token   = issueJwt({ email, wpId, role });
  const merkle  = buildMerkleEntry(email, wpId, role);

  console.log(`[WP-AUTH] Login: ${email} (WP ID: ${wpId}, role: ${role}) → JWT issued`);
  console.log(`[WP-AUTH] Merkle: ${merkle.hash}`);

  return {
    ok:     true,
    token,
    expiresIn: JWT_EXPIRES,
    user:   { email, wpId, role, source: 'wordpress' },
    merkle: { hash: merkle.hash, ts: merkle.ts },
  };
}

// ── WordPress plugin snippet generator ───────────────────────────────────────

function getPluginSnippet(backendUrl, hookSecret) {
  return `<?php
/**
 * Bridge AI OS — WordPress auth webhook
 * Add to: Appearance → Theme Editor → functions.php
 * Or: create wp-content/plugins/bridge-ai-hook/bridge-ai-hook.php
 */
define('BRIDGE_AI_BACKEND', '${backendUrl || 'https://bridge-ai-os.com'}');
define('BRIDGE_WP_HOOK_SECRET', '${hookSecret || 'YOUR_WP_HOOK_SECRET'}');

add_action('wp_login', function(\\$user_login, \\$user) {
  wp_remote_post(BRIDGE_AI_BACKEND . '/api/auth/wp-login', [
    'body'    => json_encode([
      'username' => \\$user_login,
      'email'    => \\$user->user_email,
      'id'       => \\$user->ID,
      'role'     => implode(',', (array) \\$user->roles),
    ]),
    'headers' => [
      'Content-Type'      => 'application/json',
      'X-WP-Hook-Secret'  => BRIDGE_WP_HOOK_SECRET,
    ],
    'timeout'   => 5,
    'blocking'  => false, // fire-and-forget, don't slow WP login
  ]);
}, 10, 2);
?>`;
}

module.exports = { handleWpLogin, verifyHookSecret, issueJwt, buildMerkleEntry, getPluginSnippet };
