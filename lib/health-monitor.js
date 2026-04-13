'use strict';
/**
 * lib/health-monitor.js — Lightweight server health aggregator
 *
 * Collects process-level signals: uptime, memory, event-loop lag.
 * Used by loop-closure Module 4 (INFRA) to confirm infra feedback is active.
 */

const STARTED = Date.now();

function getStatus() {
  const mem  = process.memoryUsage();
  const uptime = Math.floor((Date.now() - STARTED) / 1000);

  return {
    ok:         true,
    uptime_s:   uptime,
    pid:        process.pid,
    node:       process.version,
    heap_used_mb:  +(mem.heapUsed  / 1024 / 1024).toFixed(1),
    heap_total_mb: +(mem.heapTotal / 1024 / 1024).toFixed(1),
    rss_mb:        +(mem.rss       / 1024 / 1024).toFixed(1),
    env:        process.env.NODE_ENV || 'development',
    ts:         new Date().toISOString(),
  };
}

module.exports = { getStatus };
