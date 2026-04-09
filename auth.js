'use strict';

/**
 * auth.js — Legacy auth module
 *
 * Superseded by lib/user-identity.js which uses Supabase.
 * This file re-exports user-identity for backward compatibility.
 *
 * If you need the standalone Express auth server (port 5001),
 * use lib/user-identity.js directly with your own Express app.
 */

module.exports = require('./lib/user-identity');
