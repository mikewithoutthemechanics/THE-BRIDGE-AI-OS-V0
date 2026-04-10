/**
 * NeuroLink Integration Module
 * Wires NeuroLink into main Express server
 */

const { Router } = require('express');
const { WebSocket } = require('ws');
const { getNeuroLinkService } = require('./routes');
const { processNeuroState, buildAuditEntry } = require('./revenue-hooks');

module.exports = function setupNeuroLink(app, wsServer) {
  const router = Router();
  const neurolink = getNeuroLinkService();

  // Start inference loop
  if (process.env.NEUROLINK_ENABLED !== 'false') {
    neurolink.start();
  }

  // ────── REST API ROUTES ──────

  /**
   * GET /api/neurolink/status
   * Returns current NeuroLink status
   */
  router.get('/status', (req, res) => {
    const status = neurolink.getStatus();
    res.json(status);
  });

  /**
   * GET /api/neurolink/state
   * Returns current cognitive state
   */
  router.get('/state', (req, res) => {
    const state = neurolink.getState();
    if (!state) {
      return res.status(503).json({ error: 'NeuroLink not ready' });
    }
    res.json(state);
  });

  /**
   * GET /api/neurolink/twin
   * Returns emotion (VAD) only
   */
  router.get('/twin', (req, res) => {
    const emotion = neurolink.getEmotion();
    if (!emotion) {
      return res.status(503).json({ error: 'NeuroLink not ready' });
    }
    res.json(emotion);
  });

  /**
   * POST /api/neurolink/config
   * Update configuration
   */
  router.post('/config', (req, res) => {
    const { enabled, mode, interval } = req.body;
    const result = neurolink.setConfig({ enabled, mode, interval });
    res.json(result);
  });

  /**
   * POST /api/neurolink/input
   * Record user input (for training ambient adapter)
   */
  router.post('/input', (req, res) => {
    const { typingSpeed, isError } = req.body;
    neurolink.recordInput({ typingSpeed, isError });
    res.json({ ok: true });
  });

  /**
   * GET /api/neurolink/history
   * Get history summary
   */
  router.get('/history', async (req, res) => {
    const days = parseInt(req.query.days, 10) || 1;
    const history = await neurolink.getHistorySummary(days);
    res.json(history);
  });

  /**
   * GET /api/neurolink/summary
   * Get today's summary
   */
  router.get('/summary', async (req, res) => {
    const summary = await neurolink.getTodaySummary();
    if (!summary) {
      return res.json({ message: 'No data for today' });
    }
    res.json(summary);
  });

  /**
   * GET /api/neurolink/predictions (LEVEL 2)
   * Get latest predictive insights
   */
  router.get('/predictions', (req, res) => {
    const predictions = neurolink.getPredictions();
    res.json(predictions);
  });

  /**
   * GET /api/neurolink/next-action (LEVEL 2)
   * Get recommended next action based on predictions
   */
  router.get('/next-action', (req, res) => {
    const action = neurolink.getNextAction();
    res.json(action);
  });

  /**
   * GET /api/neurolink/user-profile (LEVEL 2)
   * Get user behavior profile and learning summary
   */
  router.get('/user-profile', (req, res) => {
    const profile = neurolink.getUserProfile();
    res.json(profile);
  });

  /**
   * POST /api/neurolink/predict-intent (LEVEL 2)
   * Predict next likely intent based on current behavior
   */
  router.post('/predict-intent', (req, res) => {
    const { currentIntent } = req.body;
    if (!currentIntent) {
      return res.status(400).json({ error: 'currentIntent required' });
    }
    const prediction = neurolink.predictNextIntent(currentIntent);
    res.json(prediction);
  });

  /**
   * GET /api/neurolink/optimal-task (LEVEL 2)
   * Get recommended task type for current user state
   */
  router.get('/optimal-task', (req, res) => {
    const recommendation = neurolink.predictOptimalTaskType();
    if (!recommendation) {
      return res.status(503).json({ error: 'NeuroLink not ready' });
    }
    res.json(recommendation);
  });

  // ────── LEVEL 3: INTELLIGENCE GRAPH + AUTONOMOUS MONETIZATION ──────

  /**
   * GET /api/neurolink/intelligence-graph (LEVEL 3)
   * Get multi-user intelligence graph summary
   */
  router.get('/intelligence-graph', (req, res) => {
    const summary = neurolink.getIntelligenceGraphSummary();
    res.json(summary);
  });

  /**
   * GET /api/neurolink/cross-user-patterns (LEVEL 3)
   * Get cross-user behavioral patterns
   */
  router.get('/cross-user-patterns', (req, res) => {
    const patterns = neurolink.getCrossUserPatterns();
    res.json(patterns);
  });

  /**
   * GET /api/neurolink/user-segment (LEVEL 3)
   * Get behavioral segment information for current user
   */
  router.get('/user-segment', (req, res) => {
    const segment = neurolink.getUserSegment('default-user');
    if (!segment) {
      return res.json({ message: 'User not yet in any segment' });
    }
    res.json(segment);
  });

  /**
   * GET /api/neurolink/autonomous-decisions (LEVEL 3)
   * Get autonomous monetization decisions and statistics
   */
  router.get('/autonomous-decisions', (req, res) => {
    const stats = neurolink.getAutonomousDecisionStats();
    res.json(stats);
  });

  /**
   * GET /api/neurolink/execution-log (LEVEL 3)
   * Get execution log of autonomous actions
   */
  router.get('/execution-log', (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 50;
    const log = neurolink.getExecutionLog(limit);
    res.json(log);
  });

  // ────── WEBSOCKET HANDLING ──────

  /**
   * WebSocket endpoint for real-time state streaming
   * Connect to: ws://host/ws/neurolink
   */
  if (wsServer) {
    wsServer.on('connection', (ws, req) => {
      // Check if this is a neurolink subscription
      if (req.url === '/ws/neurolink') {
        console.log('[NeuroLink] WebSocket client connected');
        neurolink.subscribe(ws);

        ws.on('close', () => {
          console.log('[NeuroLink] WebSocket client disconnected');
          neurolink.unsubscribe(ws);
        });

        ws.on('error', (err) => {
          console.error('[NeuroLink] WebSocket error:', err.message);
          neurolink.unsubscribe(ws);
        });

        // Handle incoming messages (e.g., input recording)
        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data);
            if (message.type === 'RECORD_INPUT') {
              neurolink.recordInput(message.data);
            } else if (message.type === 'RECORD_WINDOW_SWITCH') {
              neurolink.recordWindowSwitch();
            }
          } catch (err) {
            console.warn('[NeuroLink] Message parse error:', err.message);
          }
        });
      }
    });
  }

  // ────── REVENUE HOOKS ──────

  /**
   * Hook NeuroLink state into revenue engine
   * Called whenever state updates
   */
  async function hookRevenueEngine(state) {
    const systemAPIs = {
      pricingEngine: {
        enableHighIntentOffers: async (config) => {
          console.log('[NeuroLink→Revenue] High-intent offers enabled:', config);
          // Wire to actual pricing engine
        }
      },
      orchestrator: {
        switchToAutopilot: async (config) => {
          console.log('[NeuroLink→Revenue] Autopilot activated:', config);
          // Wire to actual orchestrator
        },
        reduceSystemLoad: async (config) => {
          console.log('[NeuroLink→Revenue] System load reduced:', config);
        },
        silenceNotifications: async (config) => {
          console.log('[NeuroLink→Revenue] Notifications silenced:', config);
        },
        prepareSessionEnd: async (config) => {
          console.log('[NeuroLink→Revenue] Session end prepared:', config);
        }
      },
      ux: {
        setMode: async (mode) => {
          console.log('[NeuroLink→Revenue] UX mode changed:', mode);
        },
        suggestFocusMode: async (config) => {
          console.log('[NeuroLink→Revenue] Focus mode suggested:', config);
        }
      },
      supportAI: {
        increaseProactiveHelp: async (config) => {
          console.log('[NeuroLink→Revenue] Proactive support increased:', config);
        }
      }
    };

    const result = await processNeuroState(state, systemAPIs);

    // Optionally log to audit trail
    if (result.ok && result.actions.length > 0) {
      result.actions.forEach(action => {
        const auditEntry = buildAuditEntry(state, action);
        // Log to audit system if available
        console.log('[NeuroLink→Audit]', auditEntry.type, auditEntry.action);
      });
    }
  }

  // Attach hook to state updates
  const originalBroadcast = neurolink.broadcastStateUpdate.bind(neurolink);
  neurolink.broadcastStateUpdate = function(state) {
    originalBroadcast(state);
    hookRevenueEngine(state).catch(err => {
      console.error('[NeuroLink] Revenue hook error:', err.message);
    });
  };

  // ────── LEVEL 3: AUTONOMOUS MONETIZATION INITIALIZATION ──────

  // Initialize autonomous monetization engine with revenue hooks
  const revenueHooks = {
    pricingEngine: systemAPIs?.pricingEngine,
    orchestrator: systemAPIs?.orchestrator,
    ux: systemAPIs?.ux,
    supportAI: systemAPIs?.supportAI
  };

  // Note: systemAPIs is defined inside hookRevenueEngine function
  // We'll initialize it when the first prediction is available
  const initializeMonetization = () => {
    if (!neurolink.autonomousMonetization && neurolink.lastPrediction?.ready) {
      const systemAPIs = {
        pricingEngine: {
          enableHighIntentOffers: async (config) => {
            console.log('[NeuroLink→Monetization] Offer enabled:', config.offer);
          }
        },
        orchestrator: {
          switchToAutopilot: async (config) => {
            console.log('[NeuroLink→Monetization] Autopilot activated');
          },
          reduceSystemLoad: async (config) => {
            console.log('[NeuroLink→Monetization] Load reduced');
          }
        },
        ux: {
          setMode: async (mode) => {
            console.log('[NeuroLink→Monetization] UX mode:', mode);
          }
        },
        supportAI: {
          increaseProactiveHelp: async (config) => {
            console.log('[NeuroLink→Monetization] Support activated');
          }
        }
      };

      neurolink.initializeAutonomousMonetization(systemAPIs);
      console.log('[NeuroLink] Level 3: Autonomous monetization engine initialized');
    }
  };

  // Wrap the original tick to initialize monetization on first prediction
  const originalTick = neurolink.tick.bind(neurolink);
  neurolink.tick = async function() {
    await originalTick();
    initializeMonetization();
  };

  // ────── SHUTDOWN ──────

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[NeuroLink] Shutting down gracefully...');
    neurolink.stop();
  });

  return router;
};

// Export service for testing
module.exports.getNeuroLinkService = getNeuroLinkService;
