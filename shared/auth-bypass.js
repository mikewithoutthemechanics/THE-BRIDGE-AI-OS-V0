'use strict';

/**
 * Temporary “no auth” mode for local/staging. Set BRIDGE_DISABLE_AUTH=1
 * (or DISABLE_AUTH=1). In production (NODE_ENV=production), you must also set
 * BRIDGE_ALLOW_AUTH_BYPASS_IN_PROD=1 or the flag is ignored.
 */

function isAuthBypassed() {
  const v = process.env.BRIDGE_DISABLE_AUTH || process.env.DISABLE_AUTH;
  if (!(v === '1' || String(v).toLowerCase() === 'true' || String(v).toLowerCase() === 'yes')) {
    return false;
  }
  if (process.env.NODE_ENV === 'production') {
    const ok = process.env.BRIDGE_ALLOW_AUTH_BYPASS_IN_PROD;
    if (!(ok === '1' || String(ok).toLowerCase() === 'true')) {
      console.warn(
        '[AUTH-BYPASS] BRIDGE_DISABLE_AUTH ignored in production — set BRIDGE_ALLOW_AUTH_BYPASS_IN_PROD=1 to enable (unsafe)',
      );
      return false;
    }
  }
  return true;
}

/** JWT-shaped payload attached as req.user when auth is bypassed */
function bypassJwtUser() {
  const email = String(process.env.BRIDGE_DEV_USER_EMAIL || 'ryanpcowan@gmail.com').trim();
  const sub = String(process.env.BRIDGE_DEV_USER_ID || 'dev-bypass').trim();
  const name = process.env.BRIDGE_DEV_USER_NAME || 'Dev (auth bypass)';
  return {
    sub,
    email,
    name,
    role: 'superadmin',
    plan: 'enterprise',
    permissions: ['*'],
    tenant: 'root',
  };
}

let _logged = false;
function logBypassOnce() {
  if (_logged) return;
  _logged = true;
  console.warn('[AUTH-BYPASS] Authentication disabled — all protected routes use synthetic superadmin (BRIDGE_DISABLE_AUTH)');
}

module.exports = { isAuthBypassed, bypassJwtUser, logBypassOnce };
