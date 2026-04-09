// =============================================================================
// AP2-v3 — Finance Agent
// Financial analysis, ROI calculation, revenue optimization
// =============================================================================
'use strict';

const BaseAgent = require('./base-agent');

class FinanceAgent extends BaseAgent {
  constructor() {
    super('finance', {
      type: 'financial',
      tier: 'L2',
      costBrdg: 8,
      skills: ['roi-analysis', 'revenue-modeling', 'cost-optimization', 'financial-forecasting'],
    });
  }

  getPrompt(input, memory = []) {
    const memoryContext = memory.length
      ? `\n\nPrevious financial context:\n${memory.map(m => '- ' + (m.input || '') + ' -> ' + (m.output || '').substring(0, 100)).join('\n')}`
      : '';
    return `Analyze the following financial scenario and provide actionable insights.

Request: ${input}
${memoryContext}

Respond in JSON with these fields:
{
  "analysis": "detailed financial analysis",
  "roi": { "projected": number, "timeframe": "string", "confidence": number },
  "recommendations": ["actionable items"],
  "risks": ["identified risks"],
  "metrics": { "revenue_impact": number, "cost_savings": number, "payback_months": number }
}`;
  }

  async execute(context) {
    this.validate(context.input);

    const systemPrompt = `You are a senior financial analyst for Bridge AI OS. You specialize in ROI calculations, revenue optimization, unit economics, and financial forecasting for digital businesses. Always provide concrete numbers and actionable recommendations. Respond only in valid JSON.`;

    const stubData = {
      analysis: `Financial analysis of: ${context.input.slice(0, 100)}`,
      roi: { projected: 2.4, timeframe: '6 months', confidence: 0.65 },
      recommendations: [
        'Optimize cost structure by consolidating service tiers',
        'Implement usage-based pricing for compute-heavy features',
        'Target 15% margin improvement through automation',
      ],
      risks: ['Market volatility may affect projections', 'Competitor pricing pressure'],
      metrics: { revenue_impact: 12000, cost_savings: 3500, payback_months: 4 },
    };

    const prompt = this.getPrompt(context.input, context.memory || []);
    const llmResult = await this.callLLM(systemPrompt, prompt, stubData);
    const parsed = this.parseResponse(llmResult.text, stubData);

    const economicScore = this.computeEconomicScore(
      { conversionRate: 0.4, commission: 0.12, category: 'fintech', successRate: 0.75 },
      context
    );

    return {
      type: 'finance',
      content: parsed,
      economicScore,
      meta: { provider: llmResult.provider, cost: llmResult.cost, fromLLM: llmResult.fromLLM },
    };
  }

  score(result, context) {
    const roi = result?.content?.roi?.projected || 0;
    const confidence = result?.content?.roi?.confidence || 0;
    const value = roi * confidence * 0.1;
    return {
      value: +value.toFixed(4),
      cost: this.costBrdg,
      efficiency: +(value / this.costBrdg).toFixed(4),
      impact: value > 0.15 ? 'high' : value > 0.05 ? 'medium' : 'low',
    };
  }
}

module.exports = FinanceAgent;
