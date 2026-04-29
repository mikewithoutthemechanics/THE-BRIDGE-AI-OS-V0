/**
 * NeuroLink Level 3: Autonomous Monetization Engine
 * Zero-operator revenue optimization using multi-user intelligence
 * Makes autonomous decisions and executes revenue strategies without human approval
 */

class AutonomousMonetization {
  constructor(intelligenceGraph, revenueHooks) {
    this.graph = intelligenceGraph;
    this.hooks = revenueHooks || {};
    this.executionLog = [];
    this.decisions = new Map(); // userId -> { action, reason, timestamp, result }
    this.performanceMetrics = {
      totalDecisions: 0,
      successfulExecutions: 0,
      revenueGenerated: 0,
      userSatisfaction: 0
    };
  }

  /**
   * Analyze user state and generate autonomous action
   * Called every inference tick for predictive action
   */
  analyzeAndExecute(userId, userState, predictions) {
    // Step 1: Get user's personal predictions
    const personalAction = predictions.nextAction;

    // Step 2: Get cross-user insights
    const crossUserRecs = this.graph.actionRecommendations.get(userId);

    // Step 3: Synthesize decision
    const decision = this._synthesizeDecision(userId, userState, personalAction, crossUserRecs);

    // Step 4: Execute if confidence high
    if (decision.confidence > 0.65) {
      this._executeAction(userId, decision);
    }

    // Store decision
    this.decisions.set(userId, {
      action: decision.action,
      reason: decision.reason,
      confidence: decision.confidence,
      timestamp: new Date().toISOString()
    });

    return decision;
  }

  /**
   * Synthesize decision from personal + cross-user signals
   */
  _synthesizeDecision(userId, userState, personalAction, crossUserRecs) {
    let action = personalAction.action;
    let reason = personalAction.reason;
    let confidence = personalAction.probability || 0.5;

    // If cross-user recommendations exist and confidence is moderate, consider adopting them
    if (crossUserRecs && crossUserRecs.length > 0 && confidence < 0.8) {
      const topRec = crossUserRecs[0];
      if (topRec.value > 0.6 && userState.stress.value < 0.7) {
        // High-value cross-user pattern + user not stressed = good time to experiment
        action = 'ADOPT_CROSS_USER_PATTERN';
        reason = topRec.reason;
        confidence = Math.min(confidence + (topRec.value * 0.3), 0.95);
      }
    }

    // Override: Churn prevention always takes priority
    if (personalAction.action === 'INTERVENE_SUPPORT') {
      action = 'INTERVENE_SUPPORT';
      confidence = Math.min(confidence + 0.1, 1);
    }

    // Smart timing: Check if this is an optimal moment for this action
    const timingBonus = this._getTimingBonus(userState, action);
    confidence = Math.min(confidence + timingBonus, 1);

    return {
      action,
      reason,
      confidence,
      userId,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Calculate timing bonus based on user state cyclicity
   */
  _getTimingBonus(userState, action) {
    const timeOfDay = new Date().getHours();
    const hourScore = Math.sin((timeOfDay - 9) * Math.PI / 12); // Peak around 9am-9pm

    // Different actions have different optimal times
    const actionTiming = {
      'PUSH_PREMIUM_OFFER': hourScore > 0.3 ? 0.1 : -0.05,
      'INTERVENE_SUPPORT': 0.15, // Always good to intervene early
      'ACTIVATE_AUTOPILOT': userState.fatigue.value > 0.75 ? 0.2 : 0,
      'REDUCE_LOAD': 0.1,
      'MONITOR': 0,
      'ADOPT_CROSS_USER_PATTERN': 0.05
    };

    return actionTiming[action] || 0;
  }

  /**
   * Execute action via revenue hooks or system APIs
   */
  _executeAction(userId, decision) {
    this.performanceMetrics.totalDecisions++;

    let result = null;
    const { action, reason } = decision;

    try {
      switch (action) {
        case 'PUSH_PREMIUM_OFFER':
          result = this._executePremiumOffer(userId, reason);
          break;

        case 'INTERVENE_SUPPORT':
          result = this._executeSupport(userId, reason);
          break;

        case 'ACTIVATE_AUTOPILOT':
          result = this._executeAutopilot(userId, reason);
          break;

        case 'REDUCE_LOAD':
          result = this._executeLoadReduction(userId, reason);
          break;

        case 'ADOPT_CROSS_USER_PATTERN':
          result = this._executePatternAdoption(userId, reason);
          break;

        default:
          result = { ok: false, error: 'Unknown action' };
      }

      if (result.ok) {
        this.performanceMetrics.successfulExecutions++;
        if (result.revenue) {
          this.performanceMetrics.revenueGenerated += result.revenue;
        }
      }

      this.executionLog.push({
        userId,
        action,
        result,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('[AutonomousMonetization] Execution error:', err.message);
      result = { ok: false, error: err.message };
    }

    return result;
  }

  /**
   * Execute premium offer action
   */
  _executePremiumOffer(userId, reason) {
    const offers = [
      { sku: 'pro_monthly', price: 29, value: 1.0, description: 'Pro subscription' },
      { sku: 'focus_pack', price: 49, value: 0.8, description: 'Focus enhancement pack' },
      { sku: 'analytics_pro', price: 19, value: 0.7, description: 'Advanced analytics' }
    ];

    const selectedOffer = offers[Math.floor(Math.random() * offers.length)];

    if (this.hooks.pricingEngine && this.hooks.pricingEngine.enableHighIntentOffers) {
      this.hooks.pricingEngine.enableHighIntentOffers({
        userId,
        offer: selectedOffer,
        reason
      });
    }

    return {
      ok: true,
      action: 'PUSH_PREMIUM_OFFER',
      offer: selectedOffer,
      revenue: selectedOffer.price,
      reason
    };
  }

  /**
   * Execute support intervention
   */
  _executeSupport(userId, reason) {
    if (this.hooks.supportAI && this.hooks.supportAI.increaseProactiveHelp) {
      this.hooks.supportAI.increaseProactiveHelp({
        userId,
        urgency: 'HIGH',
        reason
      });
    }

    return {
      ok: true,
      action: 'INTERVENE_SUPPORT',
      reason,
      revenue: 0 // Support prevents churn, revenue is indirect
    };
  }

  /**
   * Execute autopilot activation
   */
  _executeAutopilot(userId, reason) {
    if (this.hooks.orchestrator && this.hooks.orchestrator.switchToAutopilot) {
      this.hooks.orchestrator.switchToAutopilot({
        userId,
        reason,
        duration: 3600000 // 1 hour
      });
    }

    return {
      ok: true,
      action: 'ACTIVATE_AUTOPILOT',
      reason,
      revenue: 0
    };
  }

  /**
   * Execute load reduction
   */
  _executeLoadReduction(userId, reason) {
    if (this.hooks.orchestrator && this.hooks.orchestrator.reduceSystemLoad) {
      this.hooks.orchestrator.reduceSystemLoad({
        userId,
        reason,
        targetLoad: 0.5
      });
    }

    return {
      ok: true,
      action: 'REDUCE_LOAD',
      reason,
      revenue: 0
    };
  }

  /**
   * Execute pattern adoption (experimental: try a cross-user pattern on this user)
   */
  _executePatternAdoption(userId, reason) {
    const user = this.graph.users.get(userId);
    if (!user) return { ok: false, error: 'User not found' };

    // In a real system, this would:
    // 1. Create an A/B test group
    // 2. Apply the pattern-suggested workflow/feature to this user
    // 3. Track conversion impact
    // 4. Automatically scale if successful

    return {
      ok: true,
      action: 'ADOPT_CROSS_USER_PATTERN',
      reason,
      experiment: true,
      revenue: 0 // Revenue measured retrospectively
    };
  }

  /**
   * Get decision statistics
   */
  getDecisionStats() {
    const allDecisions = Array.from(this.decisions.values());
    const actionCounts = {};

    allDecisions.forEach(d => {
      actionCounts[d.action] = (actionCounts[d.action] || 0) + 1;
    });

    return {
      totalDecisions: this.performanceMetrics.totalDecisions,
      successRate: this.performanceMetrics.totalDecisions > 0
        ? (this.performanceMetrics.successfulExecutions / this.performanceMetrics.totalDecisions).toFixed(2)
        : 0,
      revenueGenerated: this.performanceMetrics.revenueGenerated,
      actionDistribution: actionCounts,
      avgConfidence: allDecisions.length > 0
        ? (allDecisions.reduce((s, d) => s + d.confidence, 0) / allDecisions.length).toFixed(2)
        : 0
    };
  }

  /**
   * Get execution log (for audit/debugging)
   */
  getExecutionLog(limit = 100) {
    return this.executionLog.slice(-limit);
  }

  /**
   * Serialize state
   */
  toJSON() {
    return {
      decisions: Array.from(this.decisions.entries()),
      performanceMetrics: this.performanceMetrics,
      executionLog: this.executionLog
    };
  }
}

module.exports = { AutonomousMonetization };
