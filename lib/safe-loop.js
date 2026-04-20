// =============================================================================
// BRIDGE AI OS — safeLoop: re-entrancy guard for async setInterval callbacks
// =============================================================================
//
// setInterval fires by wall clock and does not await the returned Promise.
// When an async tick body runs longer than its interval period, successive
// ticks pile up and run concurrently — typically causing either (a) duplicate
// work that trips unique-state checks (e.g. "task already COMPLETED") or
// (b) uncaught rejections that Node 15+ turns into a process exit.
//
// Wrap any async callback with safeLoop(fn, name) before handing it to
// setInterval. Each wrapped callback gets its own closure-local inFlight
// flag; concurrent ticks of the SAME loop are suppressed, ticks of OTHER
// loops are unaffected, and all throws are caught and logged.
//
// Usage:
//   const { safeLoop } = require('./safe-loop');
//   setInterval(safeLoop(async () => { ... }, 'ledger-sync'), 5000);
//
'use strict';

function safeLoop(fn, name) {
  var label = name || fn.name || 'anon';
  var inFlight = false;
  return async function () {
    if (inFlight) return;
    inFlight = true;
    try {
      return await fn.apply(this, arguments);
    } catch (err) {
      // Log but do not re-throw — an uncaught rejection from a setInterval
      // callback becomes an unhandledRejection event, which Node >=15
      // terminates the process for by default.
      console.error('[safeLoop:' + label + '] tick error:', err && err.message);
    } finally {
      inFlight = false;
    }
  };
}

module.exports = { safeLoop: safeLoop };
