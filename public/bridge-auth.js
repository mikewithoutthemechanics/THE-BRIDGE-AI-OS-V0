/**
 * BRIDGE AI OS — Shared Auth Utilities
 *
 * Provides sign-out that clears Supabase sessions and Bridge JWTs.
 * Include on any page: <script src="/bridge-auth.js"></script>
 */

'use strict';

window.BridgeAuth = {

  /** Get the current Bridge JWT token */
  getToken: function() {
    return localStorage.getItem('bridge_token')
      || localStorage.getItem('bridge_user_token')
      || null;
  },

  /** Get the current user object */
  getUser: function() {
    try {
      return JSON.parse(localStorage.getItem('bridge_user'));
    } catch (_) {
      return null;
    }
  },

  /** Check if a user is signed in (Bridge token OR active Supabase session) */
  isSignedIn: function() {
    if (this.getToken()) return true;
    // Check for Supabase session in localStorage (supabase stores auth tokens there)
    try {
      var keys = Object.keys(localStorage);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf('supabase') !== -1 && keys[i].indexOf('auth') !== -1) {
          var val = localStorage.getItem(keys[i]);
          if (val && val.indexOf('access_token') !== -1) return true;
        }
      }
    } catch (_) {}
    return false;
  },

  /**
   * Sign out — clears Bridge JWT + Supabase session + redirects.
   */
  signOut: async function(redirectUrl) {
    // 1. Capture token before clearing (needed for server-side revocation)
    var token = localStorage.getItem('bridge_token')
      || localStorage.getItem('bridge_user_token');

    // 2. Clear all Bridge tokens from localStorage + cookie
    localStorage.removeItem('bridge_token');
    localStorage.removeItem('bridge_user_token');
    localStorage.removeItem('bridge_user');
    localStorage.removeItem('bridge_tour_done');
    document.cookie = 'bridge_token=;path=/;max-age=0';
    document.cookie = 'access_token=;path=/;max-age=0';

    // 3. Tell the server to invalidate the token (best-effort, non-blocking)
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
      }).catch(function() {});
    }

    // 4. Sign out of Supabase — try existing client first, then create one
    try {
      if (window._supabase) {
        await window._supabase.auth.signOut();
      } else {
        var cfg = await fetch('/api/config/oauth').then(function(r){ return r.json(); }).catch(function(){ return {}; });
        var sb = window.supabase && window.supabase.createClient && cfg.supabaseUrl
          ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)
          : null;
        if (sb) await sb.auth.signOut();
      }
    } catch (_) {}

    // 5. Redirect
    window.location.href = redirectUrl || '/onboarding.html';
  },

  /**
   * Centralised post-login destination — single source of truth.
   * All post-auth redirects should call this instead of hardcoding a path.
   */
  getPostLoginRoute: function(user, pendingPlan) {
    if (pendingPlan || (user && user.pendingPlan)) {
      return '/checkout?plan=' + (pendingPlan || user.pendingPlan);
    }
    if (!user || !user.onboarded) return '/welcome';
    var role = user.role || 'user';
    if (role === 'owner' || role === 'superadmin' || role === 'admin') return '/admin-command';
    return '/portal';
  },
};
