// ai-executor.js - Real AI Service Executor for THE BRIDGE AI OS
// Handles multiple AI providers with fallback and error handling

class AIExecutor {
  constructor(options = {}) {
    this.providers = {
      kilo: {
        apiKey: process.env.KILO_API_KEY,
        baseUrl: 'https://api.kilo.ai/v1',
        model: 'kilo/x-ai/grok-code-fast-1:optimized:free'
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY,
        baseUrl: 'https://api.anthropic.com/v1',
        model: 'claude-3-5-sonnet-20241022'
      },
      openrouter: {
        apiKey: process.env.OPENROUTER_API_KEY,
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'anthropic/claude-3.5-sonnet'
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o'
      }
    };

    this.providerOrder = (process.env.LLM_PROVIDER_ORDER || 'kilo,anthropic,openrouter,openai')
      .split(',')
      .map(p => p.trim());

    this.timeout = options.timeout || 30000; // 30 seconds
    this.maxRetries = options.maxRetries || 2;
    this.callCount = 0;
    this.successCount = 0;
    this.failureCount = 0;
  }

  // Get next available provider
  getAvailableProvider() {
    for (const providerName of this.providerOrder) {
      const provider = this.providers[providerName];
      if (provider && provider.apiKey && provider.apiKey.trim() !== '') {
        return { name: providerName, config: provider };
      }
    }
    throw new Error('No available AI providers configured');
  }

  // Execute prompt with fallback providers
  async run(prompt, options = {}) {
    this.callCount++;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const { name, config } = this.getAvailableProvider();
        console.log(`🤖 AI Executor: Attempting with ${name} (attempt ${attempt + 1}/${this.maxRetries + 1})`);

        const result = await this.callProvider(name, config, prompt, options);

        this.successCount++;
        console.log(`✅ AI Executor: Success with ${name}`);
        return result;

      } catch (error) {
        console.error(`❌ AI Executor: ${error.message}`);

        // If this was the last attempt or no more providers, fail
        if (attempt === this.maxRetries) {
          this.failureCount++;
          throw new Error(`All AI providers failed. Last error: ${error.message}`);
        }

        // Try next provider by temporarily disabling the current one
        const failedProvider = this.providerOrder.shift();
        this.providerOrder.push(failedProvider);
      }
    }
  }

  // Call specific AI provider
  async callProvider(providerName, config, prompt, options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      switch (providerName) {
        case 'kilo':
          return await this.callKilo(config, prompt, controller.signal);
        case 'anthropic':
          return await this.callAnthropic(config, prompt, controller.signal);
        case 'openrouter':
          return await this.callOpenRouter(config, prompt, controller.signal);
        case 'openai':
          return await this.callOpenAI(config, prompt, controller.signal);
        default:
          throw new Error(`Unknown provider: ${providerName}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Kilo API call
  async callKilo(config, prompt, signal) {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      signal,
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`Kilo API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      provider: 'kilo',
      content: data.choices[0]?.message?.content || '',
      usage: data.usage,
      model: data.model
    };
  }

  // Anthropic API call
  async callAnthropic(config, prompt, signal) {
    const response = await fetch(`${config.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      signal,
      body: JSON.stringify({
        model: config.model,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      provider: 'anthropic',
      content: data.content[0]?.text || '',
      usage: data.usage,
      model: data.model
    };
  }

  // OpenRouter API call
  async callOpenRouter(config, prompt, signal) {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      signal,
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      provider: 'openrouter',
      content: data.choices[0]?.message?.content || '',
      usage: data.usage,
      model: data.model
    };
  }

  // OpenAI API call
  async callOpenAI(config, prompt, signal) {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      signal,
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      provider: 'openai',
      content: data.choices[0]?.message?.content || '',
      usage: data.usage,
      model: data.model
    };
  }

  // Get executor statistics
  getStats() {
    return {
      totalCalls: this.callCount,
      successfulCalls: this.successCount,
      failedCalls: this.failureCount,
      successRate: this.callCount > 0 ? (this.successCount / this.callCount * 100).toFixed(1) + '%' : '0%'
    };
  }

  // Health check
  async healthCheck() {
    try {
      const { name, config } = this.getAvailableProvider();
      // Try a simple test prompt
      await this.callProvider(name, config, 'Hello', { timeout: 5000 });
      return { healthy: true, provider: name };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}

// Export for Node.js usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIExecutor;
} else if (typeof window !== 'undefined') {
  window.AIExecutor = AIExecutor;
}