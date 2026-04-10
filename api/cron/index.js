/**
 * Cron Job Routes
 * API endpoints for scheduled tasks (reward distribution, cleanup, etc)
 */

'use strict';

const { Router } = require('express');
const distributeRewardsCron = require('./distribute-rewards');

module.exports = function setupCronRoutes(app) {
  const router = Router();

  /**
   * POST /api/cron/distribute-rewards
   * Manually trigger reward distribution (or called by external cron)
   * Query params:
   *   - eventType: event type to process (default: 'neurolink_output')
   *   - hoursBack: hours window to process (default: 1)
   *   - token: cron secret for authentication
   */
  router.post('/distribute-rewards', distributeRewardsCron);

  // Optionally: GET for health check
  router.get('/health', (req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  return router;
};
