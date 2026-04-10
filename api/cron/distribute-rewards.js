/**
 * Cron Job: Distribute Attribution Rewards
 *
 * Runs hourly to process unrewarded attribution events and distribute rewards.
 * Triggered by:
 * - External cron job (Vercel Crons, GitHub Actions, etc)
 * - Manual API call to /api/cron/distribute-rewards
 *
 * This endpoint is intended to be called by a scheduler, not directly by users.
 */

'use strict';

const distributor = require('../../lib/reward-distributor');

/**
 * Main cron handler
 * Distributes rewards for all unrewarded events from the past hour
 * @param {object} req - Request object
 * @param {object} res - Response object
 */
async function distributeRewardsCron(req, res) {
  // Security: Verify cron token if provided
  const cronToken = req.headers['x-cron-token'] || req.query.token;
  if (cronToken && cronToken !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const eventType = req.query.eventType || 'neurolink_output';
  const hoursBack = parseInt(req.query.hoursBack, 10) || 1;

  console.log(`[Cron] Starting reward distribution for ${eventType} (${hoursBack}h window)...`);

  try {
    const stats = await distributor.distributeRewards(eventType, {
      hoursBack,
      batchSize: 100,
    });

    const result = {
      success: true,
      processed: stats.processed,
      skipped: stats.skipped,
      totalReward: stats.totalReward,
      eventType,
      hoursBack,
      timestamp: new Date().toISOString(),
    };

    console.log('[Cron] Reward distribution complete:', result);
    return res.json(result);
  } catch (err) {
    console.error('[Cron] Reward distribution failed:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = distributeRewardsCron;
