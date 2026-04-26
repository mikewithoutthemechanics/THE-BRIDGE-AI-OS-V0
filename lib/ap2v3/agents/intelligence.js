// =============================================================================
// AP2-v3 — Intelligence Agent
// Market research, intent scoring, pattern detection
// =============================================================================
'use strict';

const BaseAgent = require('./base-agent');

class IntelligenceAgent extends BaseAgent {
  constructor() {
    super('intelligence', {
      type: 'intelligence',
      tier: 'L3',
      costBrdg: 10,
      skills: ['market-research', 'intent-scoring', 'pattern-detection', 'competitive-analysis'],
    });
  }

  getPrompt(input, memory = []) {
    const memoryContext = memory.length
      ? `\n\nPrevious intelligence gathered:\n${memory.map(m => '- ' + (m.input || '') + ' -> ' + (m.output || '').substring(0, 100)).join('\n')}`
      : '';
    return `Conduct market intelligence analysis for the following query.

Request: ${input}
${memoryContext}

Respond in JSON:
{
  "findings": [{ "insight": "string", "confidence": number, "source_type": "string" }],
  "intent_signals": [{ "signal": "string", "strength": number, "action": "string" }],
  "patterns": [{ "pattern": "string", "frequency": "string", "implication": "string" }],
  "competitive_landscape": { "threats": ["string"], "opportunities": ["string"] },
  "recommendation": "string"
}`;
  }

  async execute(context) {
    this.validate(context.input);

    const systemPrompt = `You are a market intelligence analyst for Bridge AI OS. You detect buying intent signals, identify market patterns, and produce competitive intelligence. Be specific with confidence scores (0-1) and actionable signals. Respond only in valid JSON.`;

    const stubData = {
      findings: [
        { insight: 'Growing demand for AI-assisted business operations in SMB segment', confidence: 0.78, source_type: 'trend_analysis' },
        { insight: 'Competitor pricing shows 20% premium over market average', confidence: 0.85, source_type: 'competitive_intel' },
        { insight: 'User engagement peaks during business hours (9-11am, 2-4pm)', confidence: 0.92, source_type: 'behavioral_data' },
      ],
      intent_signals: [
        { signal: 'Pricing page visits increased 45% this week', strength: 0.82, action: 'trigger_closer_agent' },
        { signal: 'Multiple feature comparison searches detected', strength: 0.68, action: 'send_comparison_doc' },
      ],
      patterns: [
        { pattern: 'Users who engage 3+ agents convert at 4x rate', frequency: 'consistent', implication: 'Encourage multi-agent usage in onboarding' },
        { pattern: 'Churn correlates with <2 sessions/week', frequency: 'weekly', implication: 'Activate nurture sequences for low-activity users' },
      ],
      competitive_landscape: {
        threats: ['New entrant with VC funding targeting same segment', 'Open-source alternatives gaining traction'],
        opportunities: ['Underserved vertical in logistics', 'Partnership potential with CRM platforms'],
      },
      recommendation: 'Focus acquisition on high-intent SMB segment while building moat through agent network effects.',
    };

    const prompt = this.getPrompt(context.input, context.memory || []);
    const llmResult = await this.callLLM(systemPrompt, prompt, stubData);
    const parsed = this.parseResponse(llmResult.text, stubData);

    const economicScore = this.computeEconomicScore(
      { conversionRate: 0.45, commission: 0.08, category: 'saas', successRate: 0.8 },
      context
    );

    return {
      type: 'intelligence',
      content: parsed,
      economicScore,
      meta: { provider: llmResult.provider, cost_brdg: llmResult.cost_brdg, cost_usd: llmResult.cost_usd, fromLLM: llmResult.fromLLM },
    };
  }

  score(result, context) {
    const findings = result?.content?.findings || [];
    const avgConfidence = findings.length > 0
      ? findings.reduce((s, f) => s + (f.confidence || 0), 0) / findings.length
      : 0;
    const signalCount = (result?.content?.intent_signals || []).length;
    const value = avgConfidence * 0.3 + Math.min(signalCount * 0.05, 0.2);
    return {
      value: +value.toFixed(4),
      cost: this.costBrdg,
      efficiency: +(value / this.costBrdg).toFixed(4),
      impact: value > 0.3 ? 'high' : value > 0.1 ? 'medium' : 'low',
    };
  }
}

module.exports = IntelligenceAgent;
