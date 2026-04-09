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

  /** Check if a user is signed in */
  isSignedIn: function() {
    return !!this.getToken();
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
    document.cookie = 'bridge_token=;path=/;max-age=0';

    // 3. Tell the server to invalidate the token (best-effort, non-blocking)
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
      }).catch(function() {});
    }

    // 4. Sign out of Supabase if loaded
    try {
      if (window._supabase) {
        await window._supabase.auth.signOut();
      }
    } catch (_) {}

    // 5. Redirect
    window.location.href = redirectUrl || '/onboarding.html';
  },
};
