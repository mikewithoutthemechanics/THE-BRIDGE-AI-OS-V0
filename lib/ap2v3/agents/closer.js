// =============================================================================
// AP2-v3 — Closer Agent
// Deal closing, checkout optimization, objection handling
// =============================================================================
'use strict';

const BaseAgent = require('./base-agent');

class CloserAgent extends BaseAgent {
  constructor() {
    super('closer', {
      type: 'sales',
      tier: 'L3',
      costBrdg: 12,
      skills: ['deal-closing', 'checkout-optimization', 'objection-handling', 'urgency-framing'],
    });
  }

  getPrompt(input, memory = []) {
    const memoryContext = memory.length
      ? `\n\nDeal history and previous objections:\n${memory.map(m => '- ' + (m.input || '') + ' -> ' + (m.output || '').substring(0, 100)).join('\n')}`
      : '';
    return `Create a closing strategy for the following deal scenario.

Request: ${input}
${memoryContext}

Respond in JSON:
{
  "deal_assessment": { "readiness": number, "blockers": ["string"], "decision_makers": number },
  "objection_responses": [{ "objection": "string", "response": "string", "technique": "string" }],
  "closing_tactics": [{ "tactic": "string", "timing": "string", "expected_lift": number }],
  "checkout_optimizations": ["string"],
  "urgency_elements": ["string"],
  "recommended_offer": { "discount_pct": number, "bonus": "string", "deadline": "string" }
}`;
  }

  async execute(context) {
    this.validate(context.input);

    const systemPrompt = `You are an expert sales closer for Bridge AI OS. You handle objections with empathy, optimize checkout flows, and create ethical urgency. Never use manipulative tactics. Focus on genuine value alignment between the product and the buyer's needs. Respond only in valid JSON.`;

    const stubData = {
      deal_assessment: { readiness: 0.72, blockers: ['Budget approval pending', 'Needs team buy-in'], decision_makers: 2 },
      objection_responses: [
        { objection: 'Too expensive', response: 'Let me show the ROI breakdown - most clients see payback in 3 months', technique: 'value-reframe' },
        { objection: 'Need to think about it', response: 'What specific concerns can I address right now?', technique: 'isolate-concern' },
        { objection: 'Competitor is cheaper', response: 'Here is what they charge for equivalent agent throughput and quality', technique: 'apples-to-apples' },
      ],
      closing_tactics: [
        { tactic: 'Trial-to-paid with saved progress', timing: 'Day 12 of trial', expected_lift: 0.23 },
        { tactic: 'Annual prepay discount', timing: 'At checkout', expected_lift: 0.15 },
        { tactic: 'Team plan unlock bonus agents', timing: 'When 2+ seats added', expected_lift: 0.18 },
      ],
      checkout_optimizations: [
        'Reduce form fields to 3 (email, plan, payment)',
        'Show trust badges and active user count',
        'Add 30-day money-back guarantee badge',
        'Pre-fill known user data from trial',
      ],
      urgency_elements: [
        'Current pricing locked for annual plans before Q3',
        'Limited pilot slots for enterprise tier',
      ],
      recommended_offer: { discount_pct: 15, bonus: '500 BRDG tokens + priority support for 30 days', deadline: '72 hours' },
    };

    const prompt = this.getPrompt(context.input, context.memory || []);
    const llmResult = await this.callLLM(systemPrompt, prompt, stubData);
    const parsed = this.parseResponse(llmResult.text, stubData);

    const readiness = parsed?.deal_assessment?.readiness || 0.5;
    const economicScore = this.computeEconomicScore(
      { conversionRate: readiness, commission: 0.15, category: 'saas', successRate: 0.65 },
      context
    );

    return {
      type: 'closer',
      content: parsed,
      economicScore,
      meta: { provider: llmResult.provider, cost: llmResult.cost, fromLLM: llmResult.fromLLM },
    };
  }

  score(result, context) {
    const readiness = result?.content?.deal_assessment?.readiness || 0;
    const tacticLift = (result?.content?.closing_tactics || [])
      .reduce((s, t) => s + (t.expected_lift || 0), 0);
    const value = readiness * 0.4 + Math.min(tacticLift * 0.2, 0.3);
    return {
      value: +value.toFixed(4),
      cost: this.costBrdg,
      efficiency: +(value / this.costBrdg).toFixed(4),
      impact: value > 0.3 ? 'high' : value > 0.15 ? 'medium' : 'low',
    };
  }
}

module.exports = CloserAgent;
