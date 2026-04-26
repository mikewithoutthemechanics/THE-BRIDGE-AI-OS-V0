// =============================================================================
// AP2-v3 — Support Agent
// Ticket resolution, FAQ, escalation logic
// =============================================================================
'use strict';

const BaseAgent = require('./base-agent');

class SupportAgent extends BaseAgent {
  constructor() {
    super('support', {
      type: 'support',
      tier: 'L1',
      costBrdg: 3,
      skills: ['ticket-resolution', 'faq-matching', 'escalation-logic', 'sentiment-analysis'],
    });
  }

  getPrompt(input, memory = []) {
    const memoryContext = memory.length
      ? `\n\nPrevious support interactions:\n${memory.map(m => '- ' + (m.input || '') + ' -> ' + (m.output || '').substring(0, 100)).join('\n')}`
      : '';
    return `Handle the following customer support request.

Request: ${input}
${memoryContext}

Respond in JSON:
{
  "category": "string",
  "priority": "low|medium|high|critical",
  "sentiment": { "score": number, "label": "string" },
  "resolution": { "answer": "string", "confidence": number, "sources": ["string"] },
  "follow_up_needed": boolean,
  "escalation": { "needed": boolean, "reason": "string", "department": "string" },
  "suggested_faq": [{ "question": "string", "answer": "string" }],
  "csat_prediction": number
}`;
  }

  async execute(context) {
    this.validate(context.input);

    const systemPrompt = `You are a customer support specialist for Bridge AI OS. You resolve tickets efficiently, match relevant FAQs, detect sentiment, and escalate appropriately. Be empathetic and solution-oriented. Respond only in valid JSON.`;

    const stubData = {
      category: 'account-access',
      priority: 'medium',
      sentiment: { score: 0.35, label: 'frustrated' },
      resolution: {
        answer: 'I understand the difficulty. To resolve this, please try clearing your browser cache and logging in again. If the issue persists, I can reset your session from our end.',
        confidence: 0.82,
        sources: ['KB-102: Login Troubleshooting', 'KB-045: Session Management'],
      },
      follow_up_needed: true,
      escalation: { needed: false, reason: null, department: null },
      suggested_faq: [
        { question: 'How do I reset my password?', answer: 'Visit /auth/reset and enter your registered email address.' },
        { question: 'Why am I seeing a session expired error?', answer: 'Sessions expire after 24 hours of inactivity. Clear cookies and log in again.' },
      ],
      csat_prediction: 3.8,
    };

    const prompt = this.getPrompt(context.input, context.memory || []);
    const llmResult = await this.callLLM(systemPrompt, prompt, stubData);
    const parsed = this.parseResponse(llmResult.text, stubData);

    const confidence = parsed?.resolution?.confidence || 0.5;
    const economicScore = this.computeEconomicScore(
      { conversionRate: confidence, commission: 0.05, category: 'services', successRate: confidence },
      context
    );

    return {
      type: 'support',
      content: parsed,
      economicScore,
      meta: { provider: llmResult.provider, cost_brdg: llmResult.cost_brdg, cost_usd: llmResult.cost_usd, fromLLM: llmResult.fromLLM },
    };
  }

  score(result, context) {
    const confidence = result?.content?.resolution?.confidence || 0;
    const csatPrediction = (result?.content?.csat_prediction || 0) / 5;
    const noEscalation = result?.content?.escalation?.needed === false ? 0.1 : 0;
    const value = confidence * 0.3 + csatPrediction * 0.2 + noEscalation;
    return {
      value: +value.toFixed(4),
      cost: this.costBrdg,
      efficiency: +(value / this.costBrdg).toFixed(4),
      impact: value > 0.35 ? 'high' : value > 0.15 ? 'medium' : 'low',
    };
  }
}

module.exports = SupportAgent;
