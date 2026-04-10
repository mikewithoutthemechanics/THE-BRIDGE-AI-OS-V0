/**
 * NeuroLink Serverless Cron Handlers
 * Endpoints triggered by Vercel cron jobs to replace setInterval loops
 * Enables serverless-compatible periodic processing
 */

const { getNeuroLinkService } = require('./routes');

/**
 * POST /api/neurolink/cron/tick
 * Processes a single cognitive state inference cycle
 */
async function handleInferenceTick(req, res) {
  try {
    const neurolink = getNeuroLinkService();

    if (!neurolink.enabled) {
      return res.json({
        ok: false,
        reason: 'NeuroLink disabled',
        timestamp: new Date().toISOString()
      });
    }

    await neurolink.tick();

    return res.json({
      ok: true,
      tickCount: neurolink.tickCount || 0,
      state: neurolink.currentState ? {
        focus: neurolink.currentState.focus?.value,
        stress: neurolink.currentState.stress?.value,
        fatigue: neurolink.currentState.fatigue?.value,
        intent: neurolink.currentState.intent?.label
      } : null,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[NeuroLink Cron] Tick error:', err.message);
    return res.status(500).json({
      ok: false,
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * POST /api/neurolink/cron/orchestrator
 * Processes pending monetization triggers
 */
async function handleOrchestratorProcess(req, res) {
  try {
    const neurolink = getNeuroLinkService();

    if (!neurolink.liveOrchestrator) {
      return res.json({
        ok: false,
        reason: 'Orchestrator not initialized',
        timestamp: new Date().toISOString()
      });
    }

    const triggers = neurolink.multiUserStream.getMonetizationTriggers(50);

    if (triggers.length === 0) {
      return res.json({
        ok: true,
        triggersProcessed: 0,
        timestamp: new Date().toISOString()
      });
    }

    for (const trigger of triggers) {
      await neurolink.liveOrchestrator._executeTrigger(trigger);
    }

    const stats = neurolink.liveOrchestrator.getExecutionStats();

    return res.json({
      ok: true,
      triggersProcessed: triggers.length,
      totalExecuted: stats.totalExecuted,
      activeUsers: stats.activeUsers,
      totalRevenue: stats.totalRevenue,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Orchestrator Cron] Processing error:', err.message);
    return res.status(500).json({
      ok: false,
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * POST /api/neurolink/cron/stream-flush
 * Flushes buffered user states to database
 */
async function handleStreamFlush(req, res) {
  try {
    const neurolink = getNeuroLinkService();

    if (!neurolink.multiUserStream) {
      return res.json({
        ok: false,
        reason: 'Stream not initialized',
        timestamp: new Date().toISOString()
      });
    }

    const activeUsers = neurolink.multiUserStream.getUserIds?.();
    let totalFlushed = 0;

    if (activeUsers && Array.isArray(activeUsers)) {
      for (const userId of activeUsers) {
        const flushed = await neurolink.multiUserStream._flushUserBuffer(userId);
        if (flushed) totalFlushed++;
      }
    }

    const stats = neurolink.multiUserStream.getStats();

    return res.json({
      ok: true,
      usersFlushed: totalFlushed,
      activeUsers: stats.activeUsers,
      bufferedStates: stats.bufferedStates,
      pendingTriggers: stats.pendingTriggers,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Stream Cron] Flush error:', err.message);
    return res.status(500).json({
      ok: false,
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * POST /api/neurolink/cron/graph-update
 * Regenerates cross-user patterns and recommendations
 */
async function handleGraphUpdate(req, res) {
  try {
    const neurolink = getNeuroLinkService();

    if (!neurolink.intelligenceGraph) {
      return res.json({
        ok: false,
        reason: 'Intelligence graph not initialized',
        timestamp: new Date().toISOString()
      });
    }

    if (neurolink.userClone) {
      neurolink.intelligenceGraph.registerUser('default-user', neurolink.userClone);
    }

    if (neurolink.intelligenceGraph.users.size > 1) {
      neurolink.intelligenceGraph.generateCrossUserRecommendations();
    }

    const summary = neurolink.intelligenceGraph.getSummary();

    return res.json({
      ok: true,
      userCount: summary.userCount,
      segmentCount: summary.segmentCount,
      patternCount: summary.patternCount,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Graph Cron] Update error:', err.message);
    return res.status(500).json({
      ok: false,
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * POST /api/cron/distribute-rewards
 * Distributes rewards for unrewarded attribution events (hourly)
 */
async function handleDistributeRewards(req, res) {
  try {
    // Verify cron token if provided
    const cronToken = req.headers['x-cron-token'] || req.query.token;
    if (cronToken && cronToken !== process.env.CRON_SECRET) {
      return res.status(401).json({
        ok: false,
        error: 'Unauthorized',
        timestamp: new Date().toISOString()
      });
    }

    const distributor = require('../../lib/reward-distributor');
    const eventType = req.query.eventType || 'neurolink_output';
    const hoursBack = parseInt(req.query.hoursBack, 10) || 1;

    console.log(`[Cron] Starting reward distribution for ${eventType} (${hoursBack}h window)...`);

    const stats = await distributor.distributeRewards(eventType, {
      hoursBack,
      batchSize: 100,
    });

    const result = {
      ok: true,
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
      ok: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = {
  handleInferenceTick,
  handleOrchestratorProcess,
  handleStreamFlush,
  handleGraphUpdate,
  handleDistributeRewards
};
