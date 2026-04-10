/**
 * NeuroLink → Revenue Engine Integration
 * Translates cognitive state into system actions + opportunities
 */

/**
 * Process state and trigger revenue/optimization actions
 * @param {NeuroState} state - Current cognitive state
 * @param {Object} systemAPIs - System API handlers
 */
async function processNeuroState(state, systemAPIs = {}) {
  const actions = [];
  const confidenceThreshold = 0.65;

  try {
    // HIGH FOCUS WINDOW → Push high-value offers/tasks
    if (
      state.focus.value > 0.85 &&
      state.focus.confidence > confidenceThreshold &&
      state.stress.value < 0.5
    ) {
      actions.push({
        type: 'PUSH_HIGH_VALUE_OFFERS',
        reason: 'user_high_focus_window',
        confidence: state.focus.confidence,
        config: {
          scope: 'premium_only',
          offerType: 'exclusive',
          duration: 'limited'
        },
        neurolinkSnapshot: {
          focus: state.focus.value,
          stress: state.stress.value,
          intent: state.intent.label
        }
      });

      if (systemAPIs.pricingEngine) {
        await systemAPIs.pricingEngine.enableHighIntentOffers({
          neurolinkSnapshot: state,
          window: 'focus_peak'
        });
      }
    }

    // HIGH FATIGUE → Activate autopilot
    if (
      state.fatigue.value > 0.8 &&
      state.fatigue.confidence > confidenceThreshold
    ) {
      actions.push({
        type: 'ACTIVATE_AUTOPILOT',
        reason: 'user_high_fatigue',
        confidence: state.fatigue.confidence,
        config: {
          scope: 'non_critical',
          aggressiveness: 'high',
          reduceDecisionLoad: true
        },
        neurolinkSnapshot: {
          fatigue: state.fatigue.value,
          activityLevel: state.focus.value
        }
      });

      if (systemAPIs.orchestrator) {
        await systemAPIs.orchestrator.switchToAutopilot({
          scope: 'non_critical',
          reason: 'user_fatigue_high',
          neurolinkSnapshot: state
        });
      }

      if (systemAPIs.ux) {
        await systemAPIs.ux.setMode('low_cognitive_load');
      }
    }

    // HIGH STRESS → Reduce system load
    if (
      state.stress.value > 0.75 &&
      state.stress.confidence > confidenceThreshold
    ) {
      actions.push({
        type: 'REDUCE_SYSTEM_LOAD',
        reason: 'user_high_stress',
        confidence: state.stress.confidence,
        config: {
          pauseNonCritical: true,
          increaseSupport: true,
          relaxDeadlines: true
        },
        neurolinkSnapshot: {
          stress: state.stress.value,
          calm: state.calm.value
        }
      });

      if (systemAPIs.orchestrator) {
        await systemAPIs.orchestrator.reduceSystemLoad({
          reason: 'high_stress_detected',
          neurolinkSnapshot: state
        });
      }

      if (systemAPIs.supportAI) {
        await systemAPIs.supportAI.increaseProactiveHelp({
          level: 'high',
          reason: 'stress_spike'
        });
      }
    }

    // CONTEXT SWITCHING PATTERN → Suggest focus mode
    if (
      state.intent.label === 'context_switching' &&
      state.intent.confidence > 0.7 &&
      state.focus.value < 0.6
    ) {
      actions.push({
        type: 'SUGGEST_FOCUS_MODE',
        reason: 'context_switching_detected',
        confidence: state.intent.confidence,
        config: {
          blockInterruptions: true,
          silenceNotifications: true,
          duration: 25 // Pomodoro
        },
        neurolinkSnapshot: {
          distractionIndex: 1 - state.calm.value,
          intent: state.intent.label
        }
      });

      if (systemAPIs.ux) {
        await systemAPIs.ux.suggestFocusMode({
          duration: 25,
          reason: 'context_switching_pattern',
          neurolinkSnapshot: state
        });
      }
    }

    // DEEP WORK WINDOW → Silence notifications, block interrupts
    if (
      state.intent.label === 'deep_work' &&
      state.intent.confidence > 0.8 &&
      state.focus.value > 0.75
    ) {
      actions.push({
        type: 'PROTECT_FOCUS',
        reason: 'deep_work_detected',
        confidence: state.intent.confidence,
        config: {
          silenceNotifications: true,
          blockInterrupts: true,
          autoRespond: true
        },
        neurolinkSnapshot: {
          focus: state.focus.value,
          intent: state.intent.label
        }
      });

      if (systemAPIs.orchestrator) {
        await systemAPIs.orchestrator.silenceNotifications({
          reason: 'deep_work',
          duration: 60 // minutes
        });
      }
    }

    // WINDING DOWN → Prepare for session end
    if (
      state.intent.label === 'winding_down' &&
      state.fatigue.value > 0.7
    ) {
      actions.push({
        type: 'PREPARE_SESSION_END',
        reason: 'user_winding_down',
        confidence: state.fatigue.confidence,
        config: {
          saveSessions: true,
          suggestBreak: true,
          archiveOpenTasks: true
        },
        neurolinkSnapshot: {
          fatigue: state.fatigue.value,
          activityLevel: state.focus.value
        }
      });

      if (systemAPIs.orchestrator) {
        await systemAPIs.orchestrator.prepareSessionEnd({
          reason: 'user_fatigue_high',
          neurolinkSnapshot: state
        });
      }
    }

    return {
      ok: true,
      actionCount: actions.length,
      actions,
      processedAt: new Date().toISOString(),
      confidence: {
        average: actions.length > 0
          ? actions.reduce((s, a) => s + a.confidence, 0) / actions.length
          : 0
      }
    };
  } catch (err) {
    console.error('[NeuroLink] Revenue hook processing error:', err.message);
    return {
      ok: false,
      error: err.message,
      actions: [],
      processedAt: new Date().toISOString()
    };
  }
}

/**
 * Build audit log entry for state-driven action
 */
function buildAuditEntry(state, action) {
  return {
    timestamp: new Date().toISOString(),
    type: 'NEUROLINK_ACTION',
    action: action.type,
    reason: action.reason,
    confidence: action.confidence,
    userState: {
      focus: state.focus.value,
      stress: state.stress.value,
      fatigue: state.fatigue.value,
      intent: state.intent.label
    },
    config: action.config
  };
}

module.exports = {
  processNeuroState,
  buildAuditEntry
};
