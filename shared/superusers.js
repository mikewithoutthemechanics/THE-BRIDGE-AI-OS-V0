'use strict';

// Single-source superuser loader for Node backends (auth.js, middleware/auth.js,
// server.js). Reads shared/superusers.json at module load; falls back to the
// hardcoded list if the file is missing or malformed so a bad edit cannot
// lock every admin out of every process.
const fs = require('fs');
const path = require('path');

const FALLBACK = [
  'ryanpcowan@gmail.com',
];

function load() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'superusers.json'), 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed && parsed.superusers) ? parsed.superusers : [];
    const emails = list
      .map((row) => (row && typeof row.email === 'string') ? row.email.trim().toLowerCase() : null)
      .filter(Boolean);
    if (emails.length) return emails;
  } catch (err) {
    console.warn('[superusers] failed to read shared/superusers.json, falling back:', err.message);
  }
  return FALLBACK.slice();
}

const EMAILS = Object.freeze(load());

function isSuperUserEmail(email) {
  if (typeof email !== 'string') return false;
  return EMAILS.includes(email.trim().toLowerCase());
}

/** Canonical profile applied to allowlisted superuser emails (JWT + /auth/me + UI). */
const SUPER_ADMIN_PROFILE = Object.freeze({
  role: 'superadmin',
  plan: 'enterprise',
  permissions: ['*'],
  tenant: 'root',
  displayRole: 'Super Admin',
  name: 'Ryan Cowan',
});

function isSuperAdminRole(role) {
  const r = String(role || '').toLowerCase().replace(/-/g, '_');
  return r === 'superadmin' || r === 'super_admin' || r === 'owner';
}

function isPrivilegedAdminRole(role) {
  return isSuperAdminRole(role) || String(role || '').toLowerCase() === 'admin';
}

/**
 * Merge super-admin identity onto a user row or JWT-shaped object when email matches allowlist.
 */
function applySuperAdminProfile(user) {
  if (!user || !isSuperUserEmail(user.email)) return user;
  const perms = SUPER_ADMIN_PROFILE.permissions;
  return {
    ...user,
    role: SUPER_ADMIN_PROFILE.role,
    plan: SUPER_ADMIN_PROFILE.plan,
    permissions: Array.isArray(user.permissions) && user.permissions.includes('*')
      ? user.permissions.slice()
      : perms.slice(),
    tenant: user.tenant || SUPER_ADMIN_PROFILE.tenant,
    name: user.name || SUPER_ADMIN_PROFILE.name,
    displayRole: SUPER_ADMIN_PROFILE.displayRole,
    isSuperUser: true,
  };
}

module.exports = {
  EMAILS,
  isSuperUserEmail,
  SUPER_ADMIN_PROFILE,
  applySuperAdminProfile,
  isSuperAdminRole,
  isPrivilegedAdminRole,
};
