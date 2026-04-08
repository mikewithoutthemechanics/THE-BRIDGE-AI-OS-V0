// =============================================================================
// AP2-v3 — Growth Agent
// Acquisition channels, viral loops, market expansion strategies
// =============================================================================
'use strict';

const BaseAgent = require('./base-agent');

class GrowthAgent extends BaseAgent {
  constructor() {
    super('growth', {
      type: 'growth',
      tier: 'L2',
      costBrdg: 7,
      skills: ['channel-analysis', 'viral-loops', 'market-expansion', 'cac-optimization'],
    });
  }

  getPrompt(input, memory = []) {
    const memoryContext = memory.length
      ? `\n\nPrevious growth context:\n${memory.map(m => `- ${m}`).join('\n')}`
      : '';
    return `Develop a growth strategy for the following scenario.

Request: ${input}
${memoryContext}

Respond in JSON:
{
  "strategy": "overall growth approach",
  "channels": [{ "name": "string", "cac": number, "potential_reach": number, "priority": "high|medium|low" }],
  "viral_mechanics": ["mechanisms for organic growth"],
  "expansion_plan": { "phase1": "string", "phase2": "string", "timeline": "string" },
  "kpis": { "target_growth_rate": number, "target_cac": number, "ltv_cac_ratio": number }
}`;
  }

  async execute(context) {
    this.validate(context.input);

    const systemPrompt = `You are a growth strategist for Bridge AI OS. You specialize in acquisition channel optimization, viral loop design, and market expansion. Focus on capital-efficient growth with measurable KPIs. Respond only in valid JSON.`;

    const stubData = {
      strategy: `Growth strategy for: ${context.input.slice(0, 100)}`,
      channels: [
        { name: 'Content SEO', cac: 12, potential_reach: 50000, priority: 'high' },
        { name: 'Referral Program', cac: 5, potential_reach: 15000, priority: 'high' },
        { name: 'Community Building', cac: 8, potential_reach: 25000, priority: 'medium' },
        { name: 'Paid Social', cac: 35, potential_reach: 100000, priority: 'low' },
      ],
      viral_mechanics: [
        'Agent output sharing with attribution links',
        'Team invite bonuses in BRDG tokens',
        'Public dashboards showcasing results',
      ],
      expansion_plan: {
        phase1: 'Consolidate core market with referral loops',
        phase2: 'Expand to adjacent verticals via partnerships',
        timeline: '3-6 months',
      },
      kpis: { target_growth_rate: 0.15, target_cac: 18, ltv_cac_ratio: 3.5 },
    };

    const prompt = this.getPrompt(context.input, context.memory || []);
    const llmResult = await this.callLLM(systemPrompt, prompt, stubData);
    const parsed = this.parseResponse(llmResult.text, stubData);

    const economicScore = this.computeEconomicScore(
      { conversionRate: 0.35, commission: 0.1, category: 'saas', successRate: 0.7 },
      context
    );

    return {
      type: 'growth',
      content: parsed,
      economicScore,
      meta: { provider: llmResult.provider, cost: llmResult.cost, fromLLM: llmResult.fromLLM },
    };
  }

  score(result, context) {
    const growthRate = result?.content?.kpis?.target_growth_rate || 0;
    const ltvCac = result?.content?.kpis?.ltv_cac_ratio || 0;
    const value = growthRate * Math.min(ltvCac / 3, 1) * 0.5;
    return {
      value: +value.toFixed(4),
      cost: this.costBrdg,
      efficiency: +(value / this.costBrdg).toFixed(4),
      impact: value > 0.1 ? 'high' : value > 0.03 ? 'medium' : 'low',
    };
  }
}

module.exports = GrowthAgent;
