/**
 * NeuroLink Predictive Revenue Engine
 * Forecasts conversion windows, churn risk, and fatigue dropoff
 * Uses 50-state sliding window to detect patterns
 */

function sigmoid(x) {
  return 1 / (1 + Math.exp(-Math.max(-100, Math.min(100, x))));
}

function normalize(x) {
  return Math.max(0, Math.min(1, x));
}

class PredictiveEngine {
  constructor(windowSize = 50) {
    this.window = [];
    this.windowSize = windowSize;
    this.predictions = {
      highConversionProbability: false,
      churnRisk: false,
      fatigueDropOff: false,
      optimalOfferWindow: false,
      stressIntervention: false
    };
    this.confidences = {};
  }

  /**
   * Add a state to the sliding window
   */
  update(state) {
    this.window.push(state);
    if (this.window.length > this.windowSize) {
      this.window.shift();
    }
  }

  /**
   * Calculate trend direction (positive, negative, stable)
   */
  _calculateTrend(metric, window = this.window) {
    if (window.length < 3) return 'stable';

    const recent = window.slice(-3).map(s => {
      if (metric === 'focus') return s.focus.value;
      if (metric === 'stress') return s.stress.value;
      if (metric === 'fatigue') return s.fatigue.value;
      return 0;
    });

    const slope = (recent[2] - recent[0]) / 2;
    if (slope > 0.05) return 'rising';
    if (slope < -0.05) return 'falling';
    return 'stable';
  }

  /**
   * HIGH CONVERSION PROBABILITY
   * Conditions: High focus + low stress + stable mood
   * Confidence increases if trend is stable/rising
   */
  _predictHighConversion() {
    if (this.window.length < 5) {
      return { probability: 0, confidence: 0, why: ['Insufficient data for prediction'] };
    }

    const recent = this.window.slice(-5);
    const avgFocus = recent.reduce((s, x) => s + x.focus.value, 0) / recent.length;
    const avgStress = recent.reduce((s, x) => s + x.stress.value, 0) / recent.length;
    const focusStability = 1 - (Math.max(...recent.map(x => x.focus.value)) - Math.min(...recent.map(x => x.focus.value)));

    // High focus (>0.75) + low stress (<0.45) + stable = high conversion
    const probability = sigmoid(
      (avgFocus - 0.6) * 2 +
      (0.5 - avgStress) * 1.5 +
      (focusStability - 0.5) * 1
    );

    const focusTrend = this._calculateTrend('focus');
    const stressTrend = this._calculateTrend('stress');

    const confidence = probability * 0.8 +
      (focusTrend === 'stable' || focusTrend === 'rising' ? 0.15 : 0) +
      (stressTrend === 'falling' ? 0.05 : 0);

    const why = [
      avgFocus > 0.75 ? `High focus detected (${(avgFocus * 100).toFixed(0)}%)` : `Moderate focus (${(avgFocus * 100).toFixed(0)}%)`,
      avgStress < 0.5 ? `Low stress environment (${(avgStress * 100).toFixed(0)}%)` : `Some stress present (${(avgStress * 100).toFixed(0)}%)`,
      focusStability > 0.7 ? 'Focus is stable' : 'Focus is variable',
      focusTrend === 'rising' ? 'Focus trending upward' : focusTrend === 'falling' ? 'Focus trending downward' : 'Focus stable'
    ];

    return { probability, confidence: normalize(confidence), why };
  }

  /**
   * CHURN RISK
   * Conditions: High stress + rising fatigue + low focus
   * Confidence increases if trend continues downward
   */
  _predictChurnRisk() {
    if (this.window.length < 5) {
      return { probability: 0, confidence: 0, why: ['Insufficient data for prediction'] };
    }

    const recent = this.window.slice(-5);
    const avgStress = recent.reduce((s, x) => s + x.stress.value, 0) / recent.length;
    const avgFatigue = recent.reduce((s, x) => s + x.fatigue.value, 0) / recent.length;
    const avgFocus = recent.reduce((s, x) => s + x.focus.value, 0) / recent.length;

    // High stress (>0.70) + high fatigue (>0.65) + low focus (<0.5) = churn risk
    const probability = sigmoid(
      (avgStress - 0.6) * 2 +
      (avgFatigue - 0.55) * 1.5 +
      (0.45 - avgFocus) * 1.5
    );

    const stressTrend = this._calculateTrend('stress');
    const fatigueTrend = this._calculateTrend('fatigue');

    const confidence = probability * 0.8 +
      (stressTrend === 'rising' ? 0.15 : 0) +
      (fatigueTrend === 'rising' ? 0.05 : 0);

    const why = [
      avgStress > 0.7 ? `High stress (${(avgStress * 100).toFixed(0)}%)` : `Moderate stress (${(avgStress * 100).toFixed(0)}%)`,
      avgFatigue > 0.65 ? `High fatigue (${(avgFatigue * 100).toFixed(0)}%)` : `Moderate fatigue (${(avgFatigue * 100).toFixed(0)}%)`,
      avgFocus < 0.5 ? `Low focus (${(avgFocus * 100).toFixed(0)}%)` : `Moderate focus (${(avgFocus * 100).toFixed(0)}%)`,
      stressTrend === 'rising' ? 'Stress trending upward ⚠️' : 'Stress stable',
      fatigueTrend === 'rising' ? 'Fatigue trending upward ⚠️' : 'Fatigue stable'
    ];

    return { probability, confidence: normalize(confidence), why };
  }

  /**
   * FATIGUE DROPOFF
   * Conditions: Very high fatigue (>0.80) + low activity
   * User at risk of abandoning current task
   */
  _predictFatigueDropOff() {
    if (this.window.length < 3) {
      return { probability: 0, confidence: 0, why: ['Insufficient data for prediction'] };
    }

    const recent = this.window.slice(-3);
    const avgFatigue = recent.reduce((s, x) => s + x.fatigue.value, 0) / recent.length;
    const lastFatigue = recent[recent.length - 1].fatigue.value;

    // Fatigue > 0.80 = high dropoff risk
    const probability = avgFatigue > 0.80 ? 0.85 : sigmoid((avgFatigue - 0.7) * 3);

    const confidence = lastFatigue > 0.80 ? 0.9 : 0.6;

    const why = [
      lastFatigue > 0.80 ? `CRITICAL fatigue (${(lastFatigue * 100).toFixed(0)}%)` : `High fatigue (${(lastFatigue * 100).toFixed(0)}%)`,
      avgFatigue > 0.75 ? 'Sustained fatigue detected' : 'Recent fatigue spike',
      `User at ${(probability * 100).toFixed(0)}% risk of task abandonment`
    ];

    return { probability, confidence: normalize(confidence), why };
  }

  /**
   * OPTIMAL OFFER WINDOW
   * Conditions: High focus + low stress + not fatigued
   * Best time to present premium offers
   */
  _predictOptimalOfferWindow() {
    if (this.window.length < 5) {
      return { probability: 0, confidence: 0, why: ['Insufficient data for prediction'] };
    }

    const recent = this.window.slice(-5);
    const avgFocus = recent.reduce((s, x) => s + x.focus.value, 0) / recent.length;
    const avgStress = recent.reduce((s, x) => s + x.stress.value, 0) / recent.length;
    const avgFatigue = recent.reduce((s, x) => s + x.fatigue.value, 0) / recent.length;

    // Focus > 0.75 && Stress < 0.5 && Fatigue < 0.6
    const probability = sigmoid(
      (avgFocus - 0.65) * 2.5 +
      (0.55 - avgStress) * 2 +
      (0.65 - avgFatigue) * 1.5
    );

    const isOptimal = avgFocus > 0.75 && avgStress < 0.5 && avgFatigue < 0.6;
    const confidence = isOptimal ? 0.9 : 0.5;

    const why = [
      isOptimal ? '✅ OPTIMAL WINDOW NOW' : '⏳ Window not optimal',
      avgFocus > 0.75 ? `High focus (${(avgFocus * 100).toFixed(0)}%)` : `Moderate focus (${(avgFocus * 100).toFixed(0)}%)`,
      avgStress < 0.5 ? `Low stress (${(avgStress * 100).toFixed(0)}%)` : `Some stress (${(avgStress * 100).toFixed(0)}%)`,
      avgFatigue < 0.6 ? `Low fatigue (${(avgFatigue * 100).toFixed(0)}%)` : `Elevated fatigue (${(avgFatigue * 100).toFixed(0)}%)`
    ];

    return { probability, confidence: normalize(confidence), why };
  }

  /**
   * STRESS INTERVENTION NEEDED
   * Conditions: High stress + rising trend + potential for burnout
   */
  _predictStressIntervention() {
    if (this.window.length < 5) {
      return { probability: 0, confidence: 0, why: ['Insufficient data for prediction'] };
    }

    const recent = this.window.slice(-5);
    const avgStress = recent.reduce((s, x) => s + x.stress.value, 0) / recent.length;
    const stressTrend = this._calculateTrend('stress');
    const lastStress = recent[recent.length - 1].stress.value;

    // High stress (>0.70) + rising trend = intervention needed
    const probability = sigmoid(
      (avgStress - 0.65) * 2.5 +
      (stressTrend === 'rising' ? 1.5 : stressTrend === 'falling' ? -1 : 0)
    );

    const confidence = lastStress > 0.75 && stressTrend === 'rising' ? 0.85 : 0.5;

    const why = [
      lastStress > 0.75 ? `High stress now (${(lastStress * 100).toFixed(0)}%)` : `Moderate stress (${(lastStress * 100).toFixed(0)}%)`,
      stressTrend === 'rising' ? '📈 Stress trending upward - INTERVENTION NEEDED' : `Stress ${stressTrend}`,
      avgStress > 0.7 ? 'Sustained high stress pattern detected' : 'Stress manageable'
    ];

    return { probability, confidence: normalize(confidence), why };
  }

  /**
   * Generate all predictions
   */
  predict() {
    if (this.window.length < 3) {
      return {
        ready: false,
        message: 'Gathering baseline data...',
        dataPoints: this.window.length
      };
    }

    const conv = this._predictHighConversion();
    const churn = this._predictChurnRisk();
    const fatigue = this._predictFatigueDropOff();
    const offer = this._predictOptimalOfferWindow();
    const stress = this._predictStressIntervention();

    return {
      ready: true,
      timestamp: new Date().toISOString(),
      highConversionProbability: {
        value: conv.probability,
        confidence: conv.confidence,
        why: conv.why,
        action: conv.probability > 0.75 ? 'PUSH_PREMIUM_OFFER' : 'WAIT'
      },
      churnRisk: {
        value: churn.probability,
        confidence: churn.confidence,
        why: churn.why,
        action: churn.probability > 0.70 ? 'INTERVENE_SUPPORT' : 'MONITOR'
      },
      fatigueDropOff: {
        value: fatigue.probability,
        confidence: fatigue.confidence,
        why: fatigue.why,
        action: fatigue.probability > 0.75 ? 'ACTIVATE_AUTOPILOT' : 'MONITOR'
      },
      optimalOfferWindow: {
        value: offer.probability,
        confidence: offer.confidence,
        why: offer.why,
        action: offer.probability > 0.70 ? 'OFFER_NOW' : 'DEFER'
      },
      stressIntervention: {
        value: stress.probability,
        confidence: stress.confidence,
        why: stress.why,
        action: stress.probability > 0.70 ? 'REDUCE_LOAD' : 'NORMAL'
      },
      nextAction: this._selectNextAction(conv, churn, fatigue, offer, stress)
    };
  }

  /**
   * Select optimal next action based on all predictions
   */
  _selectNextAction(conv, churn, fatigue, offer, stress) {
    // Priority: prevent churn > prevent fatigue dropoff > intervene stress > offer
    if (churn.probability > 0.50) {
      return { action: 'INTERVENE_SUPPORT', reason: 'Churn risk detected', probability: churn.probability };
    }
    if (fatigue.probability > 0.80) {
      return { action: 'ACTIVATE_AUTOPILOT', reason: 'Fatigue dropoff imminent', probability: fatigue.probability };
    }
    if (stress.probability > 0.70) {
      return { action: 'REDUCE_LOAD', reason: 'High stress + rising trend', probability: stress.probability };
    }
    if (conv.probability > 0.75 && offer.probability > 0.80) {
      return { action: 'PUSH_PREMIUM_OFFER', reason: 'Optimal conversion window', probability: conv.probability };
    }
    return { action: 'MONITOR', reason: 'All metrics normal', probability: 0 };
  }
}

module.exports = { PredictiveEngine };
