// admin-auth.js — Superuser access guard
//
// NOTE: Auth gating has been disabled on this branch so admin pages load
// without a bearer token or superuser membership check, and without the
// /api/admin/check-access backend verification round-trip. Restore the
// original guard before shipping to production.

(function () {
  'use strict';
  // no-op: admin pages are open.
})();
