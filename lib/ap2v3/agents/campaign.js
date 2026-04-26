// =============================================================================
// AP2-v3 — Campaign Agent
// Campaign creation, ad copy, channel strategy
// =============================================================================
'use strict';

const BaseAgent = require('./base-agent');

class CampaignAgent extends BaseAgent {
  constructor() {
    super('campaign', {
      type: 'marketing',
      tier: 'L2',
      costBrdg: 7,
      skills: ['campaign-design', 'ad-copy', 'channel-strategy', 'budget-allocation'],
    });
  }

  getPrompt(input, memory = []) {
    const memoryContext = memory.length
      ? `\n\nPrevious campaign performance data:\n${memory.map(m => '- ' + (m.input || '') + ' -> ' + (m.output || '').substring(0, 100)).join('\n')}`
      : '';
    return `Design a marketing campaign for the following objective.

Request: ${input}
${memoryContext}

Respond in JSON:
{
  "campaign_name": "string",
  "objective": "string",
  "target_audience": { "segments": ["string"], "demographics": "string", "psychographics": "string" },
  "channels": [{ "name": "string", "budget_pct": number, "expected_cpa": number, "creative_format": "string" }],
  "ad_copy": [{ "variant": "string", "headline": "string", "body": "string", "cta": "string" }],
  "budget": { "total": number, "daily": number, "duration_days": number },
  "expected_results": { "impressions": number, "clicks": number, "conversions": number, "roas": number }
}`;
  }

  async execute(context) {
    this.validate(context.input);

    const systemPrompt = `You are a campaign strategist for Bridge AI OS. You design multi-channel campaigns with compelling ad copy, smart budget allocation, and measurable outcomes. Focus on ROAS optimization and audience targeting precision. Respond only in valid JSON.`;

    const stubData = {
      campaign_name: 'Bridge AI Launch Sprint',
      objective: 'Drive qualified trial signups from SMB decision-makers',
      target_audience: {
        segments: ['SMB founders', 'Operations managers', 'Growth teams'],
        demographics: 'Age 28-45, tech-forward businesses, 10-200 employees',
        psychographics: 'Efficiency-focused, early adopters, growth-minded',
      },
      channels: [
        { name: 'LinkedIn Ads', budget_pct: 40, expected_cpa: 28, creative_format: 'Carousel + Lead Gen Form' },
        { name: 'Google Search', budget_pct: 30, expected_cpa: 22, creative_format: 'Responsive Search Ads' },
        { name: 'Twitter/X', budget_pct: 15, expected_cpa: 18, creative_format: 'Thread promotion + conversational ads' },
        { name: 'Content Syndication', budget_pct: 15, expected_cpa: 35, creative_format: 'Sponsored articles + webinar' },
      ],
      ad_copy: [
        { variant: 'A', headline: 'Your AI Business Team, Ready in Minutes', body: '10 specialized agents handle finance, growth, sales and more. Pay per result.', cta: 'Start Free Trial' },
        { variant: 'B', headline: 'Stop Hiring, Start Delegating to AI', body: 'Bridge AI agents close deals, nurture leads, and optimize revenue 24/7.', cta: 'See It In Action' },
      ],
      budget: { total: 5000, daily: 167, duration_days: 30 },
      expected_results: { impressions: 250000, clicks: 5000, conversions: 200, roas: 3.2 },
    };

    const prompt = this.getPrompt(context.input, context.memory || []);
    const llmResult = await this.callLLM(systemPrompt, prompt, stubData);
    const parsed = this.parseResponse(llmResult.text, stubData);

    const roas = parsed?.expected_results?.roas || 1;
    const economicScore = this.computeEconomicScore(
      { conversionRate: Math.min(roas / 5, 0.8), commission: 0.1, category: 'ecommerce', successRate: 0.65 },
      context
    );

    return {
      type: 'campaign',
      content: parsed,
      economicScore,
      meta: { provider: llmResult.provider, cost_brdg: llmResult.cost_brdg, cost_usd: llmResult.cost_usd, fromLLM: llmResult.fromLLM },
    };
  }

  score(result, context) {
    const roas = result?.content?.expected_results?.roas || 0;
    const conversionRate = (result?.content?.expected_results?.conversions || 0) /
      Math.max(result?.content?.expected_results?.clicks || 1, 1);
    const value = Math.min(roas / 5, 1) * 0.4 + conversionRate * 0.3;
    return {
      value: +value.toFixed(4),
      cost: this.costBrdg,
      efficiency: +(value / this.costBrdg).toFixed(4),
      impact: value > 0.25 ? 'high' : value > 0.1 ? 'medium' : 'low',
    };
  }
}

module.exports = CampaignAgent;
