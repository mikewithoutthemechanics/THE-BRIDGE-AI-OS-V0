// =============================================================================
// AP2-v3 — Quote Agent
// Quote generation, pricing, proposal building
// =============================================================================
'use strict';

const BaseAgent = require('./base-agent');

class QuoteAgent extends BaseAgent {
  constructor() {
    super('quote', {
      type: 'sales',
      tier: 'L2',
      costBrdg: 6,
      skills: ['quote-generation', 'dynamic-pricing', 'proposal-building', 'discount-logic'],
    });
  }

  getPrompt(input, memory = []) {
    const memoryContext = memory.length
      ? `\n\nPrevious quotes and pricing context:\n${memory.map(m => `- ${m}`).join('\n')}`
      : '';
    return `Generate a professional quote/proposal for the following request.

Request: ${input}
${memoryContext}

Respond in JSON:
{
  "quote_id": "string",
  "line_items": [{ "item": "string", "qty": number, "unit_price": number, "total": number }],
  "subtotal": number,
  "discount": { "type": "string", "amount": number, "reason": "string" },
  "total": number,
  "currency": "string",
  "valid_until": "string",
  "terms": ["string"],
  "upsells": [{ "item": "string", "price": number, "value_prop": "string" }]
}`;
  }

  async execute(context) {
    this.validate(context.input);

    const systemPrompt = `You are a pricing and proposal specialist for Bridge AI OS. You create accurate quotes with competitive pricing, strategic discounts, and relevant upsells. Ensure all math is correct and terms are clear. Respond only in valid JSON.`;

    const stubData = {
      quote_id: `BRG-Q-${Date.now().toString(36).toUpperCase()}`,
      line_items: [
        { item: 'Bridge AI OS Pro Plan (Annual)', qty: 1, unit_price: 2388, total: 2388 },
        { item: 'Additional Agent Seats (x3)', qty: 3, unit_price: 240, total: 720 },
        { item: 'Priority Support Add-on', qty: 1, unit_price: 480, total: 480 },
      ],
      subtotal: 3588,
      discount: { type: 'early-adopter', amount: 358.80, reason: '10% early adopter discount for annual commitment' },
      total: 3229.20,
      currency: 'USD',
      valid_until: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      terms: [
        'Payment due within 14 days of acceptance',
        '30-day money-back guarantee',
        'Annual billing, cancel anytime after first year',
      ],
      upsells: [
        { item: 'Enterprise Analytics Dashboard', price: 99, value_prop: 'Track agent ROI and team performance in real-time' },
        { item: 'Custom Agent Training', price: 499, value_prop: 'Fine-tune agents on your proprietary data and workflows' },
      ],
    };

    const prompt = this.getPrompt(context.input, context.memory || []);
    const llmResult = await this.callLLM(systemPrompt, prompt, stubData);
    const parsed = this.parseResponse(llmResult.text, stubData);

    const dealSize = parsed.total || 0;
    const convRate = dealSize > 5000 ? 0.25 : dealSize > 1000 ? 0.4 : 0.55;
    const economicScore = this.computeEconomicScore(
      { conversionRate: convRate, commission: 0.1, category: 'saas', successRate: 0.72 },
      context
    );

    return {
      type: 'quote',
      content: parsed,
      economicScore,
      meta: { provider: llmResult.provider, cost: llmResult.cost, fromLLM: llmResult.fromLLM },
    };
  }

  score(result, context) {
    const total = result?.content?.total || 0;
    const upsellCount = (result?.content?.upsells || []).length;
    const value = Math.min(total / 10000, 1) * 0.3 + upsellCount * 0.05;
    return {
      value: +value.toFixed(4),
      cost: this.costBrdg,
      efficiency: +(value / this.costBrdg).toFixed(4),
      impact: value > 0.2 ? 'high' : value > 0.08 ? 'medium' : 'low',
    };
  }
}

module.exports = QuoteAgent;
