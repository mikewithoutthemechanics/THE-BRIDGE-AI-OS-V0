/**
 * onboarding.js — Bridge AI OS login-flow helpers
 *
 * Persists auth credentials to localStorage and routes users to the
 * appropriate landing page:
 *   • Superusers  → /admin.html
 *   • All others  → /dashboard.html
 *
 * Required localStorage keys:
 *   bridge_token  — JWT access token
 *   user_email    — authenticated user email
 *   user_id       — authenticated user ID
 */

'use strict';

(function () {
  const SUPERUSERS = [
    'ryanpcowan@gmail.com',
    'michaelgraemek@gmail.com',
    'marvin.saunders@gmail.com',
  ];

  /**
   * Persist auth data and redirect after a successful login.
   * @param {{ token: string, email: string, userId: string|number }} user
   */
  function handleLoginSuccess(user) {
    localStorage.setItem('bridge_token', user.token);
    localStorage.setItem('user_email', user.email);
    localStorage.setItem('user_id', String(user.userId || user.id || ''));

    if (SUPERUSERS.includes(String(user.email).toLowerCase())) {
      window.location.href = '/admin.html';
    } else {
      window.location.href = '/dashboard.html';
    }
  }

  // Expose globally for inline script usage
  window.handleLoginSuccess = handleLoginSuccess;
})();
