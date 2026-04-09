// =============================================================================
// AP2-v3 — Supply Agent
// Vendor sourcing, inventory, supply chain optimization
// =============================================================================
'use strict';

const BaseAgent = require('./base-agent');

class SupplyAgent extends BaseAgent {
  constructor() {
    super('supply', {
      type: 'operations',
      tier: 'L2',
      costBrdg: 6,
      skills: ['vendor-sourcing', 'inventory-management', 'supply-chain-optimization', 'cost-negotiation'],
    });
  }

  getPrompt(input, memory = []) {
    const memoryContext = memory.length
      ? `\n\nPrevious supply chain data:\n${memory.map(m => '- ' + (m.input || '') + ' -> ' + (m.output || '').substring(0, 100)).join('\n')}`
      : '';
    return `Analyze and optimize the supply chain scenario described below.

Request: ${input}
${memoryContext}

Respond in JSON:
{
  "analysis": "string",
  "vendors": [{ "name": "string", "score": number, "lead_time_days": number, "cost_index": number, "reliability": number }],
  "inventory_recommendation": { "reorder_point": number, "safety_stock": number, "optimal_order_qty": number, "strategy": "string" },
  "cost_savings": { "current_monthly": number, "optimized_monthly": number, "savings_pct": number },
  "risks": [{ "risk": "string", "probability": number, "mitigation": "string" }],
  "action_plan": [{ "step": number, "action": "string", "timeline": "string", "expected_impact": "string" }]
}`;
  }

  async execute(context) {
    this.validate(context.input);

    const systemPrompt = `You are a supply chain optimization specialist for Bridge AI OS. You evaluate vendors, optimize inventory levels, identify cost savings, and mitigate supply risks. Use quantitative analysis with concrete numbers. Respond only in valid JSON.`;

    const stubData = {
      analysis: `Supply chain analysis for: ${context.input.slice(0, 100)}`,
      vendors: [
        { name: 'Primary Cloud Provider', score: 0.88, lead_time_days: 0, cost_index: 1.0, reliability: 0.995 },
        { name: 'Secondary CDN', score: 0.82, lead_time_days: 1, cost_index: 0.85, reliability: 0.99 },
        { name: 'API Gateway Service', score: 0.79, lead_time_days: 0, cost_index: 0.72, reliability: 0.98 },
      ],
      inventory_recommendation: {
        reorder_point: 1000,
        safety_stock: 250,
        optimal_order_qty: 2500,
        strategy: 'Just-in-time with safety buffer for demand spikes',
      },
      cost_savings: { current_monthly: 8500, optimized_monthly: 6200, savings_pct: 27 },
      risks: [
        { risk: 'Single vendor dependency for compute', probability: 0.15, mitigation: 'Maintain warm standby with secondary provider' },
        { risk: 'API rate limit changes from upstream', probability: 0.25, mitigation: 'Implement request queuing and caching layer' },
        { risk: 'Currency fluctuation on international services', probability: 0.3, mitigation: 'Negotiate fixed-rate annual contracts' },
      ],
      action_plan: [
        { step: 1, action: 'Audit current vendor contracts and usage', timeline: 'Week 1', expected_impact: 'Identify 15% waste' },
        { step: 2, action: 'Negotiate volume discounts with top 2 vendors', timeline: 'Week 2-3', expected_impact: '10-20% cost reduction' },
        { step: 3, action: 'Implement multi-vendor failover', timeline: 'Week 3-4', expected_impact: '99.95% uptime guarantee' },
        { step: 4, action: 'Set up automated reorder alerts', timeline: 'Week 4', expected_impact: 'Zero stockout incidents' },
      ],
    };

    const prompt = this.getPrompt(context.input, context.memory || []);
    const llmResult = await this.callLLM(systemPrompt, prompt, stubData);
    const parsed = this.parseResponse(llmResult.text, stubData);

    const savingsPct = (parsed?.cost_savings?.savings_pct || 0) / 100;
    const economicScore = this.computeEconomicScore(
      { conversionRate: 0.5 + savingsPct * 0.3, commission: 0.1, category: 'ecommerce', successRate: 0.75 },
      context
    );

    return {
      type: 'supply',
      content: parsed,
      economicScore,
      meta: { provider: llmResult.provider, cost_brdg: llmResult.cost_brdg, cost_usd: llmResult.cost_usd, fromLLM: llmResult.fromLLM },
    };
  }

  score(result, context) {
    const savingsPct = (result?.content?.cost_savings?.savings_pct || 0) / 100;
    const avgReliability = (result?.content?.vendors || [])
      .reduce((s, v) => s + (v.reliability || 0), 0) / Math.max((result?.content?.vendors || []).length, 1);
    const value = savingsPct * 0.4 + avgReliability * 0.2;
    return {
      value: +value.toFixed(4),
      cost: this.costBrdg,
      efficiency: +(value / this.costBrdg).toFixed(4),
      impact: value > 0.25 ? 'high' : value > 0.1 ? 'medium' : 'low',
    };
  }
}

module.exports = SupplyAgent;
