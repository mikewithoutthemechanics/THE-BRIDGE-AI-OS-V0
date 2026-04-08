/**
 * BRIDGE AI OS — AP2-v3 Orchestration Engine
 *
 * Core execution engine that routes inputs to agents and chains
 * multi-step workflows. Handles intent parsing, single execution,
 * multi-agent chains, and full lifecycle management.
 */

'use strict';

const agents = require('./agents');
const memory = require('./memory');
const bus = require('./message-bus');
const resilience = require('./resilience');
const contract = require('./contract');

// ── Intent Keyword Maps ────────────────────────────────────────────────────

const INTENT_MAP = {
  finance:      ['revenue', 'roi', 'profit', 'budget', 'financial', 'earnings', 'forecast', 'cash flow', 'margin', 'expense'],
  growth:       ['acquire', 'channel', 'viral', 'scale', 'growth', 'expand', 'traction', 'retention', 'churn', 'funnel'],
  intelligence: ['analyze', 'market', 'competitor', 'trend', 'research', 'insight', 'data', 'benchmark', 'landscape', 'opportunity'],
  nurture:      ['follow up', 'warm', 'engage', 'sequence', 'nurture', 'drip', 'onboard', 'relationship', 'touchpoint', 're-engage'],
  closer:       ['close', 'deal', 'convert', 'checkout', 'negotiate', 'proposal', 'contract', 'sign', 'win', 'upsell'],
  quote:        ['quote', 'price', 'proposal', 'estimate', 'pricing', 'invoice', 'cost estimate', 'bid', 'rfp', 'quotation'],
  campaign:     ['campaign', 'ad', 'promote', 'launch', 'marketing', 'advertise', 'promo', 'branding', 'outreach', 'blast'],
  creative:     ['write', 'create', 'headline', 'copy', 'content', 'blog', 'article', 'tagline', 'slogan', 'draft'],
  support:      ['help', 'issue', 'ticket', 'problem', 'support', 'bug', 'fix', 'troubleshoot', 'resolve', 'complaint'],
  supply:       ['vendor', 'supplier', 'inventory', 'source', 'supply', 'procurement', 'warehouse', 'stock', 'logistics', 'fulfillment'],
};

// Chain connectors — words that signal multi-step intent
const CHAIN_CONNECTORS = ['then', 'and then', 'after that', 'next', 'followed by', 'before', 'finally'];

// ── Orchestrator Class ─────────────────────────────────────────────────────

class Orchestrator {

  /**
   * Parse user input to determine intent and target agent(s).
   * @param {string} input
   * @returns {{ agent?: string, agents?: string[], confidence: number, isChain: boolean }}
   */
  parseIntent(input) {
    if (!input || typeof input !== 'string') {
      return { agent: 'intelligence', confidence: 0.1, isChain: false };
    }

    const lower = input.toLowerCase();

    // ── Check for chain connectors first ──────────────────────────────
    let isChain = false;
    let segments = [lower];

    for (const conn of CHAIN_CONNECTORS) {
      if (lower.includes(conn)) {
        isChain = true;
        // Split on the connector
        segments = lower.split(new RegExp('\\b' + conn.replace(/\s+/g, '\\s+') + '\\b')).filter(Boolean);
        break;
      }
    }

    if (isChain && segments.length > 1) {
      const chainAgents = [];
      for (const segment of segments) {
        const match = this._matchSegment(segment.trim());
        if (match.agent && !chainAgents.includes(match.agent)) {
          chainAgents.push(match.agent);
        }
      }

      if (chainAgents.length > 1) {
        return {
          agents: chainAgents,
          confidence: Math.min(0.9, chainAgents.reduce((s, _) => s, 0.5) + chainAgents.length * 0.1),
          isChain: true,
        };
      }
    }

    // ── Single agent match ────────────────────────────────────────────
    const match = this._matchSegment(lower);
    return { agent: match.agent, confidence: match.confidence, isChain: false };
  }

  /**
   * Match a text segment to a single agent.
   * @param {string} text
   * @returns {{ agent: string, confidence: number }}
   * @private
   */
  _matchSegment(text) {
    const scores = {};

    for (const [agentName, keywords] of Object.entries(INTENT_MAP)) {
      let score = 0;
      for (const kw of keywords) {
        if (text.includes(kw)) {
          score += kw.includes(' ') ? 2 : 1; // multi-word keywords worth more
        }
      }
      if (score > 0) scores[agentName] = score;
    }

    const entries = Object.entries(scores);
    if (entries.length === 0) {
      return { agent: 'intelligence', confidence: 0.3 };
    }

    entries.sort((a, b) => b[1] - a[1]);
    const [topAgent, topScore] = entries[0];
    const confidence = Math.min(0.95, 0.5 + topScore * 0.1);

    return { agent: topAgent, confidence };
  }

  /**
   * Execute a single agent with full lifecycle.
   * @param {string} agentName
   * @param {string} input
   * @param {string} sessionId
   * @returns {Promise<object>}
   */
  async executeSingle(agentName, input, sessionId) {
    const start = Date.now();
    const agent = agents.getAgent(agentName);

    if (!agent) {
      return contract.error(agentName, 'Agent not found', 'AGENT_NOT_FOUND');
    }

    try {
      agent.validate(input);
    } catch (err) {
      return contract.error(agentName, err.message, 'VALIDATION_ERROR');
    }

    const context = {
      input,
      session: sessionId,
      memory: memory.recall(sessionId, 5),
    };

    bus.publish('agent.start', { agent: agentName, input: input.slice(0, 200), session: sessionId });

    try {
      const retryOut = await resilience.withRetry(
        async () => {
          const timeoutOut = await resilience.withTimeout(() => agent.execute(context), 15000);
          // withTimeout returns { result, timedOut, elapsed_ms }
          return timeoutOut.result !== undefined ? timeoutOut.result : timeoutOut;
        },
        3, 1000
      );
      // withRetry returns { result, retries, errors }
      const result = retryOut.result !== undefined ? retryOut.result : retryOut;
      const retries = retryOut.retries || 0;

      const score = agent.score(result, context);
      const outputStr = typeof result.content === 'string' ? result.content : JSON.stringify(result);
      memory.remember(sessionId, agentName, input, outputStr, score.value, result.tokens || 0);
      bus.publish('agent.complete', {
        agent: agentName,
        score,
        latency: Date.now() - start,
        session: sessionId,
      });

      return contract.success(agentName, result, {
        latency_ms: Date.now() - start,
        cost: agent.costBrdg,
        tokens: result.tokens || 0,
        retries,
      });
    } catch (err) {
      bus.publish('agent.error', { agent: agentName, error: err.message, session: sessionId });
      return contract.error(agentName, err.message, 'EXECUTION_ERROR', {
        latency_ms: Date.now() - start,
      });
    }
  }

  /**
   * Execute a multi-agent chain.
   * @param {string[]} agentNames
   * @param {string} input
   * @param {string} sessionId
   * @returns {Promise<object>}
   */
  async executeChain(agentNames, input, sessionId) {
    const chainStart = Date.now();
    const chain = [];
    let currentInput = input;

    bus.publish('chain.start', { agents: agentNames, session: sessionId });

    for (const name of agentNames) {
      const result = await this.executeSingle(name, currentInput, sessionId);
      chain.push({ agent: name, result: result.data, score: result.meta });

      if (result.status === 'error') {
        bus.publish('chain.error', { agent: name, step: chain.length, total: agentNames.length, session: sessionId });
        break;
      }

      // Feed output of current step as input to next step
      currentInput = typeof result.data.content === 'string'
        ? result.data.content
        : JSON.stringify(result.data.content);

      bus.publish('chain.step', { agent: name, step: chain.length, total: agentNames.length });
    }

    bus.publish('chain.complete', { agents: agentNames, steps: chain.length, session: sessionId });

    return contract.success('orchestrator', {
      type: 'chain_result',
      content: chain[chain.length - 1]?.result?.content || 'Chain completed',
      chain,
    }, {
      latency_ms: Date.now() - chainStart,
      cost: chain.reduce((s, c) => s + (c.score?.cost || 0), 0),
      tokens: chain.reduce((s, c) => s + (c.score?.tokens || 0), 0),
    });
  }

  /**
   * Auto-route: parse intent then execute.
   * @param {string} input
   * @param {string} sessionId
   * @returns {Promise<object>}
   */
  async process(input, sessionId) {
    const intent = this.parseIntent(input);
    bus.publish('intent.parsed', { intent, input: (input || '').slice(0, 200), session: sessionId });

    if (intent.isChain) {
      return this.executeChain(intent.agents, input, sessionId);
    }
    return this.executeSingle(intent.agent, input, sessionId);
  }
}

module.exports = Orchestrator;
