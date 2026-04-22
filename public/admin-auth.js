/**
 * admin-auth.js — Bridge AI OS admin access guard
 *
 * NOTE: Auth gating has been disabled on this branch so admin pages load
 * without a bearer token or superuser membership check. Restore the original
 * guard (localStorage `bridge_token` + `SUPERUSERS` allowlist → redirect to
 * /onboarding.html) before shipping to production.
 */

(function () {
  'use strict';
  // no-op: admin pages are open.
})();
