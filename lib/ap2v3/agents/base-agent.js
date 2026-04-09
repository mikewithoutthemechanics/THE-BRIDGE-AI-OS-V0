// =============================================================================
// AP2-v3 — Base Agent Class
// All modular agents extend this. Provides validate/execute/score contract.
// =============================================================================
'use strict';

class BaseAgent {
  constructor(name, config = {}) {
    this.name = name;
    this.type = config.type || 'general';
    this.tier = config.tier || 'L1';
    this.costBrdg = config.costBrdg || 5;
    this.skills = config.skills || [];
  }

  /**
   * Validate input before execution.
   * @param {string} input
   * @returns {boolean}
   */
  validate(input) {
    if (!input || typeof input !== 'string') {
      throw new Error('Input must be a non-empty string');
    }
    return true;
  }

  /**
   * Execute the agent's core logic. Must be overridden.
   * @param {object} context - { input, memory, user, meta }
   * @returns {Promise<object>}
   */
  async execute(context) {
    throw new Error('execute() must be implemented');
  }

  /**
   * Score the result for economic value.
   * @param {object} result
   * @param {object} context
   * @returns {object}
   */
  score(result, context) {
    return {
      value: 0,
      cost: this.costBrdg,
      efficiency: 0,
      impact: 'neutral',
    };
  }

  /**
   * Build the prompt for LLM inference. Override per agent.
   * @param {string} input
   * @param {Array} memory - previous interaction context
   * @returns {string}
   */
  getPrompt(input, memory) {
    return input;
  }

  /**
   * Gracefully call the LLM, falling back to stub data if unavailable.
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {object} stubData - fallback if LLM is unavailable
   * @returns {Promise<object>}
   */
  async callLLM(systemPrompt, userPrompt, stubData = {}) {
    try {
      const llm = require('../../llm-client');
      const response = await llm.infer(userPrompt, { system: systemPrompt });
      const cost_usd = response.cost_usd || 0;
      return { text: response.text, fromLLM: true, provider: response.provider, cost_usd, cost_brdg: cost_usd / 0.1 };
    } catch (err) {
      console.warn(`[${this.name}] LLM unavailable (${err.message}), using stub`);
      return { text: JSON.stringify(stubData), fromLLM: false, provider: 'stub', cost_usd: 0, cost_brdg: 0 };
    }
  }

  /**
   * Parse LLM text response into structured JSON, with fallback.
   * @param {string} text
   * @param {object} fallback
   * @returns {object}
   */
  parseResponse(text, fallback = {}) {
    if (!text || typeof text !== 'string') return { summary: '', ...fallback };
    try {
      // Try markdown fenced JSON first
      const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (fenced) {
        return JSON.parse(fenced[1].trim());
      }
      // Try direct JSON parse
      return JSON.parse(text.trim());
    } catch (e) {
      // Fall back to extracting first complete JSON object
      let depth = 0, start = -1;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') { if (start === -1) start = i; depth++; }
        else if (text[i] === '}') { depth--; if (depth === 0 && start !== -1) {
          try { return JSON.parse(text.substring(start, i + 1)); } catch (e2) { start = -1; }
        }}
      }
    }
    return { summary: text.slice(0, 500), ...fallback };
  }

  /**
   * Compute economic score using the scoring engine.
   * @param {object} result
   * @param {object} context
   * @returns {object}
   */
  computeEconomicScore(result, context = {}) {
    try {
      const scoring = require('../../economic-scoring');
      const option = {
        conversionRate: result.conversionRate || 0.3,
        commission: result.commission || 0.1,
        successRate: result.successRate || 0.7,
        userRating: result.userRating || 0.8,
        category: result.category || 'services',
      };
      const value = scoring.economicScore(option, context.user || {});
      const efficiency = this.costBrdg > 0 ? value / this.costBrdg : 0;
      return {
        value: +value.toFixed(4),
        cost: this.costBrdg,
        efficiency: +efficiency.toFixed(4),
        impact: value > 0.1 ? 'high' : value > 0.03 ? 'medium' : 'low',
      };
    } catch (_) {
      return this.score(result, context);
    }
  }
}

module.exports = BaseAgent;
