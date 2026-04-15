/**
 * admin-auth.js — Bridge AI OS admin access guard
 *
 * Include this script at the TOP of any admin-only HTML page.
 * Immediately redirects to /onboarding.html if:
 *   • No bridge_token in localStorage, OR
 *   • user_email is not in the SUPERUSERS list
 */

(function () {
  'use strict';

  var SUPERUSERS = [
    'ryanpcowan@gmail.com',
    'michaelgraemek@gmail.com',
    'marvin.saunders@gmail.com',
  ];

  var token = localStorage.getItem('bridge_token');
  var email = (localStorage.getItem('user_email') || '').toLowerCase();

  if (!token || !SUPERUSERS.includes(email)) {
    window.location.replace('/onboarding.html');
  }
})();
