// =============================================================================
// AP2-v3 — Nurture Agent
// Lead warming, email sequences, engagement scoring
// =============================================================================
'use strict';

const BaseAgent = require('./base-agent');

class NurtureAgent extends BaseAgent {
  constructor() {
    super('nurture', {
      type: 'nurture',
      tier: 'L1',
      costBrdg: 4,
      skills: ['lead-warming', 'email-sequences', 'engagement-scoring', 'drip-campaigns'],
    });
  }

  getPrompt(input, memory = []) {
    const memoryContext = memory.length
      ? `\n\nPrevious interactions with this lead:\n${memory.map(m => `- ${m}`).join('\n')}`
      : '';
    return `Design a lead nurture strategy for the following scenario.

Request: ${input}
${memoryContext}

Respond in JSON:
{
  "engagement_score": number,
  "lead_temperature": "cold|warm|hot",
  "sequence": [{ "day": number, "channel": "string", "action": "string", "content_brief": "string" }],
  "triggers": [{ "event": "string", "response": "string" }],
  "next_best_action": "string",
  "escalate_to": "string|null"
}`;
  }

  async execute(context) {
    this.validate(context.input);

    const systemPrompt = `You are a lead nurturing specialist for Bridge AI OS. You design warming sequences, calculate engagement scores, and determine optimal touchpoints. Focus on moving leads through the funnel without being pushy. Respond only in valid JSON.`;

    const stubData = {
      engagement_score: 62,
      lead_temperature: 'warm',
      sequence: [
        { day: 0, channel: 'email', action: 'welcome', content_brief: 'Personalized welcome with value proposition aligned to their use case' },
        { day: 2, channel: 'in-app', action: 'tip', content_brief: 'Show how to use the agent they viewed most' },
        { day: 5, channel: 'email', action: 'case-study', content_brief: 'Success story from similar business profile' },
        { day: 8, channel: 'in-app', action: 'offer', content_brief: 'Free trial extension or credit bonus for activation' },
        { day: 14, channel: 'email', action: 'check-in', content_brief: 'Personal check-in asking about their goals' },
      ],
      triggers: [
        { event: 'pricing_page_visit', response: 'Send comparison guide and offer live demo' },
        { event: 'agent_execution_3x', response: 'Upgrade prompt with usage-based justification' },
        { event: 'no_activity_7d', response: 'Re-engagement email with new feature highlight' },
      ],
      next_best_action: 'Send personalized case study matching their industry',
      escalate_to: null,
    };

    const prompt = this.getPrompt(context.input, context.memory || []);
    const llmResult = await this.callLLM(systemPrompt, prompt, stubData);
    const parsed = this.parseResponse(llmResult.text, stubData);

    const engagementFactor = (parsed.engagement_score || 50) / 100;
    const economicScore = this.computeEconomicScore(
      { conversionRate: engagementFactor * 0.5, commission: 0.08, category: 'services', successRate: 0.7 },
      context
    );

    return {
      type: 'nurture',
      content: parsed,
      economicScore,
      meta: { provider: llmResult.provider, cost: llmResult.cost, fromLLM: llmResult.fromLLM },
    };
  }

  score(result, context) {
    const engagement = (result?.content?.engagement_score || 0) / 100;
    const tempBonus = { cold: 0, warm: 0.1, hot: 0.25 }[result?.content?.lead_temperature] || 0;
    const value = engagement * 0.3 + tempBonus;
    return {
      value: +value.toFixed(4),
      cost: this.costBrdg,
      efficiency: +(value / this.costBrdg).toFixed(4),
      impact: value > 0.25 ? 'high' : value > 0.1 ? 'medium' : 'low',
    };
  }
}

module.exports = NurtureAgent;
