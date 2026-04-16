// admin-auth.js — Superuser access guard
const SUPERUSERS = ['ryanpcowan@gmail.com', 'michaelgraemek@gmail.com', 'marvin.saunders@gmail.com'];

(function() {
  'use strict';

  // Get auth token and user email
  const token = localStorage.getItem('bridge_token');
  const userEmail = localStorage.getItem('user_email');

  // If no token or email, redirect to onboarding
  if (!token || !userEmail) {
    console.log('Admin auth: No token or email found, redirecting to onboarding');
    window.location.replace('/onboarding.html');
    return;
  }

  // Check if email is in superuser list (client-side check)
  const isSuperUser = SUPERUSERS.includes(userEmail.toLowerCase());

  if (!isSuperUser) {
    console.log('Admin auth: User is not a superuser, redirecting to dashboard');
    window.location.replace('/dashboard.html');
    return;
  }

  // Verify with backend (server-side check)
  fetch('/api/admin/check-access?user_email=' + encodeURIComponent(userEmail), {
    headers: {
      'Authorization': 'Bearer ' + token
    }
  })
  .then(response => response.json())
  .then(data => {
    if (!data.is_superuser) {
      console.log('Admin auth: Backend verification failed, redirecting to dashboard');
      window.location.replace('/dashboard.html');
      return;
    }

    console.log('Admin auth: Access granted for superuser', userEmail);
    // Access granted, continue loading admin page
  })
  .catch(error => {
    console.error('Admin auth: Backend verification error', error);
    // On error, allow access but log the issue
    console.warn('Admin auth: Proceeding with client-side check only due to API error');
  });

})();