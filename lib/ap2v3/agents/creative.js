// =============================================================================
// AP2-v3 — Creative Agent
// Content generation, headlines, visual direction
// =============================================================================
'use strict';

const BaseAgent = require('./base-agent');

class CreativeAgent extends BaseAgent {
  constructor() {
    super('creative', {
      type: 'creative',
      tier: 'L1',
      costBrdg: 5,
      skills: ['copywriting', 'headline-generation', 'visual-direction', 'brand-voice'],
    });
  }

  getPrompt(input, memory = []) {
    const memoryContext = memory.length
      ? `\n\nBrand voice and previous creative context:\n${memory.map(m => '- ' + (m.input || '') + ' -> ' + (m.output || '').substring(0, 100)).join('\n')}`
      : '';
    return `Create marketing/content creative for the following brief.

Request: ${input}
${memoryContext}

Respond in JSON:
{
  "headlines": [{ "text": "string", "style": "string", "target": "string" }],
  "body_copy": { "short": "string", "medium": "string", "long": "string" },
  "visual_direction": { "style": "string", "colors": ["string"], "imagery": "string", "mood": "string" },
  "cta_options": ["string"],
  "content_variations": [{ "platform": "string", "format": "string", "adapted_copy": "string" }],
  "tone_analysis": { "formality": number, "energy": number, "warmth": number }
}`;
  }

  async execute(context) {
    this.validate(context.input);

    const systemPrompt = `You are a creative director for Bridge AI OS. You generate compelling headlines, persuasive copy, and visual direction briefs. Maintain a professional yet approachable brand voice. Every piece should drive action. Respond only in valid JSON.`;

    const stubData = {
      headlines: [
        { text: 'AI Agents That Actually Close Deals', style: 'bold-direct', target: 'founders' },
        { text: 'Your Business Runs Itself Now', style: 'aspirational', target: 'operators' },
        { text: '10 Agents. Zero Overhead. Infinite Scale.', style: 'data-driven', target: 'growth-teams' },
      ],
      body_copy: {
        short: 'Bridge AI deploys 10 specialized agents that handle everything from lead nurture to deal closing.',
        medium: 'Stop juggling tools and hires. Bridge AI OS gives you a full business operations team powered by specialized AI agents. Finance, growth, sales, support -- all running 24/7 with real economic scoring.',
        long: 'Bridge AI OS is the modular agent runtime that replaces fragmented workflows with a unified, economically-scored AI team. Each of our 10 specialized agents handles a critical business function -- from financial analysis and market intelligence to lead nurturing and deal closing. Every action is scored for ROI, every result is tracked on-chain, and every agent improves with your data.',
      },
      visual_direction: {
        style: 'Clean tech-minimal with accent gradients',
        colors: ['#1a1a2e', '#16213e', '#0f3460', '#e94560'],
        imagery: 'Abstract network nodes connecting, suggesting agent collaboration',
        mood: 'Confident, modern, trustworthy',
      },
      cta_options: ['Deploy Your AI Team', 'Start Building Free', 'See Agents in Action'],
      content_variations: [
        { platform: 'LinkedIn', format: 'carousel', adapted_copy: 'Slide 1: The problem. Slide 2: The old way. Slide 3: Bridge AI. Slide 4: Results. Slide 5: CTA.' },
        { platform: 'Twitter/X', format: 'thread', adapted_copy: 'Hook tweet + 4 value tweets + CTA with demo link' },
        { platform: 'Landing page', format: 'hero section', adapted_copy: 'Headline + 3-word value props + social proof bar + single CTA' },
      ],
      tone_analysis: { formality: 0.6, energy: 0.75, warmth: 0.65 },
    };

    const prompt = this.getPrompt(context.input, context.memory || []);
    const llmResult = await this.callLLM(systemPrompt, prompt, stubData);
    const parsed = this.parseResponse(llmResult.text, stubData);

    const economicScore = this.computeEconomicScore(
      { conversionRate: 0.3, commission: 0.08, category: 'services', successRate: 0.75 },
      context
    );

    return {
      type: 'creative',
      content: parsed,
      economicScore,
      meta: { provider: llmResult.provider, cost_brdg: llmResult.cost_brdg, cost_usd: llmResult.cost_usd, fromLLM: llmResult.fromLLM },
    };
  }

  score(result, context) {
    const headlineCount = (result?.content?.headlines || []).length;
    const variationCount = (result?.content?.content_variations || []).length;
    const energy = result?.content?.tone_analysis?.energy || 0;
    const value = Math.min(headlineCount * 0.05, 0.2) + Math.min(variationCount * 0.04, 0.15) + energy * 0.15;
    return {
      value: +value.toFixed(4),
      cost: this.costBrdg,
      efficiency: +(value / this.costBrdg).toFixed(4),
      impact: value > 0.25 ? 'high' : value > 0.1 ? 'medium' : 'low',
    };
  }
}

module.exports = CreativeAgent;
