// THE BRIDGE AI OS - Explore Page JavaScript
// Interactive demos and pathway exploration

class ExplorePage {
    constructor() {
        this.init();
    }

    init() {
        this.setupLiveSync();
        this.setupDemos();
        this.setupPathwayButtons();
        this.startLiveUpdates();
    }

    setupLiveSync() {
        // Extend the global liveSync instance
        if (window.liveSync) {
            // Explore page receives updates but doesn't generate them
        }
    }

    setupDemos() {
        this.setupIntelligenceDemo();
        this.setupEconomicDemo();
        this.setupSystemDemo();
        this.setupIntegrationDemo();
    }

    setupIntelligenceDemo() {
        const submitBtn = document.getElementById('intelligence-submit');
        const promptInput = document.getElementById('intelligence-prompt');
        const resultDiv = document.getElementById('intelligence-result');

        if (submitBtn && promptInput && resultDiv) {
            submitBtn.addEventListener('click', async () => {
                const prompt = promptInput.value.trim();
                if (!prompt) {
                    this.showDemoResult(resultDiv, 'Please enter a query to analyze.', 'error');
                    return;
                }

                this.showDemoResult(resultDiv, '🧠 Analyzing your query with causal AI...', 'loading');

                try {
                    // Simulate AI analysis (replace with actual API call)
                    const analysis = await this.simulateIntelligenceAnalysis(prompt);
                    this.showDemoResult(resultDiv, analysis, 'success');
                } catch (error) {
                    this.showDemoResult(resultDiv, 'Analysis failed. Please try again.', 'error');
                }
            });
        }
    }

    async simulateIntelligenceAnalysis(prompt) {
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        const responses = [
            `🔍 **Causal Analysis Complete**\n\nQuery: "${prompt}"\n\n**Key Insights:**\n• Identified 3 primary causal relationships\n• Confidence level: 87%\n• Recommended actions: Optimize pricing strategy\n\n**Tree of Thoughts Reasoning:**\n1. Initial hypothesis validation\n2. Counterfactual analysis\n3. Probabilistic outcome modeling`,

            `🧠 **Intelligence Synthesis**\n\nAnalyzing: "${prompt}"\n\n**Causal Chain Identified:**\n📊 Input → 🤖 Processing → 💡 Insights → 🎯 Actions\n\n**Economic Impact:**\n• Potential value creation: $45K-67K\n• Risk reduction: 23%\n• Opportunity confidence: High`,

            `🎯 **Advanced Reasoning Results**\n\nProblem: "${prompt}"\n\n**Multi-path Analysis:**\n• Path A: Direct causal intervention (68% success)\n• Path B: Systemic optimization (45% success)\n• Path C: Hybrid approach (82% success)\n\n**Recommendation:** Path C - Combined intervention and optimization`
        ];

        return responses[Math.floor(Math.random() * responses.length)];
    }

    setupEconomicDemo() {
        const scanBtn = document.getElementById('scan-opportunities');
        const resultDiv = document.getElementById('opportunities-result');

        if (scanBtn && resultDiv) {
            scanBtn.addEventListener('click', async () => {
                this.showDemoResult(resultDiv, '🔍 Scanning market for economic opportunities...', 'loading');

                try {
                    const opportunities = await this.simulateEconomicScan();
                    this.showDemoResult(resultDiv, opportunities, 'success');
                } catch (error) {
                    this.showDemoResult(resultDiv, 'Market scan failed. Please try again.', 'error');
                }
            });
        }
    }

    async simulateEconomicScan() {
        await new Promise(resolve => setTimeout(resolve, 3000));

        return `📊 **Economic Opportunity Scan Complete**\n\n**High-Value Opportunities Found:**\n\n1. **🏭 Manufacturing Optimization**\n   • Potential savings: $2.3M annually\n   • Implementation: 6-8 weeks\n   • ROI: 340%\n\n2. **🏪 Retail Pricing Strategy**\n   • Revenue increase: $890K projected\n   • Market share gain: 12%\n   • Risk level: Low\n\n3. **💼 Service Automation**\n   • Cost reduction: $1.7M\n   • Quality improvement: 28%\n   • Scalability: High\n\n**Total Economic Impact:** $5.2M+`;
    }

    setupSystemDemo() {
        // System demo updates are handled by live sync
        this.updateSystemMetrics();
        setInterval(() => this.updateSystemMetrics(), 5000);
    }

    updateSystemMetrics() {
        const intelligenceEl = document.getElementById('live-intelligence');
        const opportunitiesEl = document.getElementById('live-opportunities');
        const systemLoadEl = document.getElementById('live-system-load');
        const mcpStatusEl = document.getElementById('live-mcp-status');

        if (intelligenceEl && opportunitiesEl && systemLoadEl && mcpStatusEl) {
            // Simulate live data updates
            const intelligence = 1250 + Math.floor(Math.random() * 20 - 10);
            const opportunities = 89 + Math.floor(Math.random() * 6 - 3);
            const systemLoad = 20 + Math.floor(Math.random() * 10);
            const mcpStatus = Math.random() > 0.1 ? 'Connected' : 'Reconnecting';

            intelligenceEl.textContent = intelligence.toLocaleString();
            opportunitiesEl.textContent = opportunities;
            systemLoadEl.textContent = `${systemLoad}%`;
            mcpStatusEl.textContent = mcpStatus;
            mcpStatusEl.className = mcpStatus === 'Connected' ? 'metric-value status-good' : 'metric-value status-warning';
        }
    }

    setupIntegrationDemo() {
        const testBtn = document.getElementById('test-api');
        const endpointSelect = document.getElementById('api-endpoint');
        const resultDiv = document.getElementById('api-result');

        if (testBtn && endpointSelect && resultDiv) {
            testBtn.addEventListener('click', async () => {
                const endpoint = endpointSelect.value;
                if (!endpoint) {
                    this.showDemoResult(resultDiv, 'Please select an API endpoint.', 'error');
                    return;
                }

                this.showDemoResult(resultDiv, `🔗 Testing ${endpoint}...`, 'loading');

                try {
                    const response = await this.testAPIEndpoint(endpoint);
                    this.showDemoResult(resultDiv, response, 'success');
                } catch (error) {
                    this.showDemoResult(resultDiv, `API test failed: ${error.message}`, 'error');
                }
            });
        }
    }

    async testAPIEndpoint(endpoint) {
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1500));

        const responses = {
            '/api/health': `✅ **API Response**\n\n\`\`\`json\n{\n  "status": "healthy",\n  "system": "THE BRIDGE AI OS",\n  "version": "1.0.0",\n  "uptime": 3600,\n  "timestamp": "${new Date().toISOString()}"\n}\n\`\`\``,

            '/api/system-status': `✅ **System Status**\n\n\`\`\`json\n{\n  "intelligence_engine": "ACTIVE",\n  "economic_cycles": "RUNNING",\n  "event_bus": "OPERATIONAL",\n  "revenue_forecasting": "OPTIMIZED",\n  "mcp_connections": 12\n}\n\`\`\``,

            '/api/economic-data': `✅ **Economic Data**\n\n\`\`\`json\n{\n  "intelligence_cycles": 1250,\n  "opportunities_created": 89,\n  "executions_completed": 67,\n  "revenue_forecasted": 2450000,\n  "last_updated": "${new Date().toISOString()}",\n  "confidence_level": 0.87\n}\n\`\`\``
        };

        return responses[endpoint] || 'Unknown endpoint';
    }

    setupPathwayButtons() {
        const pathwayButtons = document.querySelectorAll('.pathway-btn');

        pathwayButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetId = button.getAttribute('href').substring(1);
                const targetElement = document.getElementById(targetId);

                if (targetElement) {
                    targetElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });

                    // Add visual highlight
                    targetElement.style.boxShadow = '0 0 0 3px var(--primary-color)';
                    setTimeout(() => {
                        targetElement.style.boxShadow = '';
                    }, 3000);
                }
            });
        });
    }

    showDemoResult(element, content, type) {
        element.className = `demo-result ${type}`;

        if (type === 'loading') {
            element.innerHTML = `
                <div class="loading-indicator">
                    <div class="loading-spinner"></div>
                    <p>${content}</p>
                </div>
            `;
        } else {
            element.innerHTML = content.replace(/\n/g, '<br>');
        }
    }

    startLiveUpdates() {
        // Update metrics every few seconds
        setInterval(() => {
            this.updateLiveElements();
        }, 3000);
    }

    updateLiveElements() {
        // Update any live counters or status indicators
        const liveElements = document.querySelectorAll('[data-live]');

        liveElements.forEach(element => {
            const type = element.dataset.live;
            if (type === 'counter') {
                const current = parseInt(element.textContent.replace(/,/g, ''));
                const change = Math.floor(Math.random() * 10 - 5);
                const newValue = Math.max(0, current + change);
                element.textContent = newValue.toLocaleString();
            }
        });
    }
}

// Add explore-specific styles
const exploreStyles = document.createElement('style');
exploreStyles.textContent = `
.explore-header {
    background: linear-gradient(135deg, var(--background-primary), var(--background-secondary));
    padding: 4rem 0 2rem;
    text-align: center;
}

.explore-header h1 {
    font-size: 3rem;
    margin-bottom: 1rem;
    background: linear-gradient(135deg, var(--primary-color), var(--accent-color));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.explore-subtitle {
    font-size: 1.2rem;
    color: var(--text-secondary);
    max-width: 700px;
    margin: 0 auto;
}

.bridge-pathways {
    padding: 3rem 0;
    background: var(--background-primary);
}

.pathways-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 2rem;
}

.pathway-card {
    background: var(--background-secondary);
    border: 1px solid var(--border-color);
    border-radius: 16px;
    padding: 2rem;
    text-align: center;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
}

.pathway-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, var(--primary-color), var(--accent-color));
}

.pathway-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 15px 35px var(--shadow-color);
    border-color: var(--primary-color);
}

.pathway-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
}

.pathway-card h3 {
    color: var(--primary-color);
    margin-bottom: 1rem;
    font-size: 1.5rem;
}

.pathway-features {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
}

.feature-tag {
    background: var(--background-tertiary);
    color: var(--text-secondary);
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: 500;
}

.pathway-btn {
    background: var(--primary-color);
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    text-decoration: none;
    display: inline-block;
    transition: background 0.3s ease;
}

.pathway-btn:hover {
    background: var(--secondary-color);
}

.demos-section {
    padding: 4rem 0;
    background: var(--background-secondary);
}

.demos-section h2 {
    text-align: center;
    margin-bottom: 1rem;
    color: var(--primary-color);
}

.demos-subtitle {
    text-align: center;
    color: var(--text-secondary);
    margin-bottom: 3rem;
    max-width: 600px;
    margin-left: auto;
    margin-right: auto;
}

.demo-container {
    background: var(--background-primary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    margin-bottom: 3rem;
    overflow: hidden;
}

.demo-header {
    background: var(--background-tertiary);
    padding: 1.5rem;
    border-bottom: 1px solid var(--border-color);
}

.demo-header h3 {
    color: var(--primary-color);
    margin: 0;
    font-size: 1.25rem;
}

.demo-interface {
    padding: 2rem;
}

.demo-input {
    margin-bottom: 2rem;
}

.demo-input textarea {
    width: 100%;
    padding: 1rem;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--background-secondary);
    color: var(--text-primary);
    font-family: inherit;
    resize: vertical;
    min-height: 100px;
}

.demo-input textarea:focus {
    outline: none;
    border-color: var(--primary-color);
}

.demo-btn {
    background: var(--primary-color);
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    transition: background 0.3s ease;
}

.demo-btn:hover {
    background: var(--secondary-color);
}

.demo-result {
    background: var(--background-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1.5rem;
    white-space: pre-line;
    font-family: 'Monaco', monospace;
    font-size: 0.9rem;
    line-height: 1.6;
}

.demo-result.loading {
    text-align: center;
}

.demo-result.success {
    border-color: var(--success-color);
}

.demo-result.error {
    border-color: var(--error-color);
    color: var(--error-color);
}

.loading-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
}

.loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--border-color);
    border-top: 4px solid var(--primary-color);
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.economic-scanner {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
}

.scanner-controls {
    display: flex;
    gap: 1rem;
    align-items: center;
}

.scanner-controls select {
    padding: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--background-secondary);
    color: var(--text-primary);
}

.opportunities-display {
    background: var(--background-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1.5rem;
    min-height: 200px;
}

.system-metrics {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 2rem;
    align-items: center;
}

.metric-display {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
}

.metric-item {
    background: var(--background-tertiary);
    padding: 1rem;
    border-radius: 8px;
    text-align: center;
}

.metric-item .metric-label {
    color: var(--text-secondary);
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
}

.metric-item .metric-value {
    color: var(--primary-color);
    font-size: 1.5rem;
    font-weight: 700;
}

.status-good {
    color: var(--success-color) !important;
}

.status-warning {
    color: var(--warning-color) !important;
}

.ai-brain-large {
    position: relative;
    width: 150px;
    height: 150px;
    margin: 0 auto;
}

.brain-waves-large {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
}

.brain-core-large {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 3rem;
    z-index: 2;
    animation: pulse-brain 3s infinite;
}

@keyframes pulse-brain {
    0%, 100% { transform: translate(-50%, -50%) scale(1); }
    50% { transform: translate(-50%, -50%) scale(1.1); }
}

.api-explorer {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
}

.api-controls {
    display: flex;
    gap: 1rem;
    align-items: center;
}

.api-controls select {
    padding: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--background-secondary);
    color: var(--text-primary);
}

.api-response {
    background: var(--background-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1.5rem;
    min-height: 200px;
    font-family: 'Monaco', monospace;
    font-size: 0.9rem;
    white-space: pre-wrap;
}

.journey-section {
    padding: 4rem 0;
    background: var(--background-primary);
}

.journey-path {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 2rem;
    max-width: 1000px;
    margin: 0 auto;
}

.journey-step {
    background: var(--background-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 2rem;
    text-align: center;
    max-width: 200px;
    transition: all 0.3s ease;
}

.journey-step:hover {
    border-color: var(--primary-color);
    box-shadow: 0 5px 15px var(--shadow-color);
}

.step-number {
    font-size: 2rem;
    font-weight: 700;
    color: var(--primary-color);
    margin-bottom: 1rem;
    display: inline-block;
    width: 60px;
    height: 60px;
    line-height: 60px;
    border-radius: 50%;
    background: var(--background-tertiary);
    border: 2px solid var(--primary-color);
}

.journey-step h4 {
    color: var(--primary-color);
    margin-bottom: 1rem;
}

.journey-arrow {
    font-size: 2rem;
    color: var(--primary-color);
    font-weight: 700;
}

@media (max-width: 768px) {
    .explore-header h1 {
        font-size: 2rem;
    }

    .pathways-grid {
        grid-template-columns: 1fr;
    }

    .system-metrics {
        grid-template-columns: 1fr;
    }

    .journey-path {
        flex-direction: column;
    }

    .journey-arrow {
        transform: rotate(90deg);
    }
}
`;
document.head.appendChild(exploreStyles);

// Initialize explore page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.explorePage = new ExplorePage();
});