// THE BRIDGE AI OS - Learn Page JavaScript
// Interactive learning modules and progression tracking

class LearnPage {
    constructor() {
        this.currentPath = 'beginner';
        this.init();
    }

    init() {
        this.setupPathSelection();
        this.setupLiveSync();
        this.setupInteractiveElements();
        this.loadProgress();
    }

    setupPathSelection() {
        const pathButtons = document.querySelectorAll('.path-btn');

        pathButtons.forEach(button => {
            button.addEventListener('click', () => {
                const path = button.dataset.path || button.getAttribute('href').substring(1).replace('-content', '');
                this.switchPath(path);
            });
        });
    }

    switchPath(path) {
        // Hide all content sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.add('hidden');
        });

        // Show selected path content
        const targetSection = document.getElementById(`${path}-content`);
        if (targetSection) {
            targetSection.classList.remove('hidden');

            // Update path buttons
            document.querySelectorAll('.path-btn').forEach(btn => {
                btn.classList.remove('active');
            });

            const activeButton = document.querySelector(`[data-path="${path}"]`) ||
                               document.querySelector(`a[href="#${path}-content"]`);
            if (activeButton) {
                activeButton.classList.add('active');
            }

            this.currentPath = path;
            this.saveProgress();
        }

        // Smooth scroll to content
        targetSection.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }

    setupInteractiveElements() {
        this.setupCausalDemo();
        this.setupTaskBuilder();
    }

    setupCausalDemo() {
        const causalBtn = document.getElementById('causal-btn');
        const causalResult = document.getElementById('causal-result');

        if (causalBtn && causalResult) {
            causalBtn.addEventListener('click', () => {
                this.showCausalAnalysis(causalResult);
            });
        }
    }

    async showCausalAnalysis(resultElement) {
        resultElement.innerHTML = '<div class="loading-indicator"><div class="loading-spinner"></div><p>Analyzing causal relationships...</p></div>';

        // Simulate analysis delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        const analysis = `
            🔍 **Causal Relationship Analysis**

            **Hypothesis Testing:**
            • Hot weather → Ice cream sales: Strong positive correlation (r = 0.78)
            • Confounding variables: Seasonal events, holidays, temperature preferences
            • Causal strength: Medium (controlled for confounders)

            **Counterfactual Scenarios:**
            • If weather wasn't hot: Sales would drop ~40%
            • If no seasonal events: Sales would drop ~25%
            • Combined effect: Weather + Events = 65% of sales variance

            **Economic Implications:**
            • Causal intervention: Dynamic pricing based on weather forecasts
            • Predictive accuracy: 73% improvement with causal modeling
            • Revenue optimization: $2.3M additional annual revenue potential

            **Recommended Actions:**
            1. Implement weather-based pricing algorithms
            2. Develop causal forecasting models
            3. Create intervention strategies for demand optimization
        `;

        resultElement.innerHTML = analysis.replace(/\n/g, '<br>');
        resultElement.className = 'demo-result success';
    }

    setupTaskBuilder() {
        const runTaskBtn = document.getElementById('run-task-btn');
        const marketSelect = document.getElementById('market-select');
        const analysisFocus = document.getElementById('analysis-focus');
        const taskResult = document.getElementById('task-result');

        if (runTaskBtn && taskResult) {
            runTaskBtn.addEventListener('click', async () => {
                const market = marketSelect.value;
                const focus = analysisFocus.value.trim();

                if (!focus) {
                    this.showTaskResult(taskResult, 'Please specify what you want to analyze.', 'error');
                    return;
                }

                this.showTaskResult(taskResult, `🤖 Running economic analysis for ${market} market focusing on: ${focus}...`, 'loading');

                try {
                    const result = await this.runEconomicAnalysis(market, focus);
                    this.showTaskResult(taskResult, result, 'success');
                } catch (error) {
                    this.showTaskResult(taskResult, 'Analysis failed. Please try again.', 'error');
                }
            });
        }
    }

    async runEconomicAnalysis(market, focus) {
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 3000));

        const analyses = {
            technology: {
                growth_potential: `
                    📊 **Technology Market Analysis: Growth Potential**

                    **Market Overview:**
                    • Current market size: $2.3T (2026)
                    • Projected growth: 12.4% CAGR (2026-2030)
                    • Key drivers: AI adoption, cloud computing, IoT

                    **Growth Opportunities:**
                    1. **AI Integration Services** - $89B market opportunity
                       • Adoption rate: 23% (current) → 67% (2030)
                       • Entry barriers: Medium
                       • Competitive advantage: Causal AI expertise

                    2. **Cloud Optimization** - $156B addressable market
                       • Cost reduction potential: 35-50%
                       • Implementation timeline: 6-12 months
                       • ROI timeline: 8-15 months

                    3. **IoT Data Analytics** - $78B emerging market
                       • Data volume growth: 300% (2026-2030)
                       • Monetization potential: $2.4M per enterprise
                       • Risk level: Medium-High

                    **Strategic Recommendations:**
                    • Focus on AI integration services (highest ROI)
                    • Develop cloud optimization expertise
                    • Monitor IoT data analytics trends
                    • Invest in causal AI R&D

                    **Risk Assessment:**
                    • Market volatility: Medium
                    • Competition intensity: High
                    • Technology obsolescence: Low (AI-driven)
                    • Entry timing: Optimal (early adopter advantage)
                `,
                risk_factors: `
                    📊 **Technology Market Analysis: Risk Factors**

                    **Primary Risk Categories:**

                    1. **Regulatory Risks** (Severity: High)
                       • Data privacy regulations evolving rapidly
                       • AI ethics and bias concerns increasing
                       • International trade restrictions possible
                       • Mitigation: Compliance automation, ethical AI frameworks

                    2. **Technology Risks** (Severity: Medium-High)
                       • Rapid technological obsolescence
                       • Cybersecurity threats increasing
                       • Talent acquisition challenges
                       • Mitigation: Continuous learning programs, security-first approach

                    3. **Market Risks** (Severity: Medium)
                       • Economic downturns impact tech spending
                       • Competition from established players
                       • Market saturation in mature segments
                       • Mitigation: Diversification, cost leadership, innovation focus

                    **Risk Mitigation Strategies:**
                    • Implement comprehensive compliance frameworks
                    • Develop robust cybersecurity measures
                    • Invest in continuous employee training
                    • Maintain diversified market presence
                    • Build strategic partnerships for market access

                    **Overall Risk Assessment:** Medium
                    **Recommended Risk Budget:** 15-20% of annual revenue
                `
            },
            finance: {
                growth_potential: `
                    📊 **Finance Market Analysis: Growth Potential**

                    **Market Overview:**
                    • Current market size: $1.8T (2026)
                    • Projected growth: 8.7% CAGR (2026-2030)
                    • Key drivers: Digital transformation, regulatory changes, AI adoption

                    **Growth Opportunities:**
                    1. **AI-Powered Risk Assessment** - $45B market opportunity
                       • Fraud detection improvement: 94% accuracy
                       • Implementation: 4-8 months
                       • Compliance benefits: Automated regulatory reporting

                    2. **Algorithmic Trading** - $78B high-frequency market
                       • Performance improvement: 23-45% better returns
                       • Speed advantage: Microsecond-level execution
                       • Risk management: Enhanced portfolio optimization

                    3. **Personalized Wealth Management** - $92B growing segment
                       • Client retention increase: 35%
                       • AUM growth potential: 28%
                       • User experience: Fully personalized recommendations

                    **Strategic Recommendations:**
                    • Start with risk assessment (lowest risk, highest compliance value)
                    • Expand to algorithmic trading (technical expertise required)
                    • Develop wealth management solutions (high customer lifetime value)

                    **Market Entry Strategy:**
                    • Phase 1: Risk assessment (6 months)
                    • Phase 2: Wealth management (12 months)
                    • Phase 3: Algorithmic trading (18 months)
                `,
                risk_factors: `
                    📊 **Finance Market Analysis: Risk Factors**

                    **Critical Risk Factors:**

                    1. **Regulatory Compliance** (Severity: Critical)
                       • Stringent financial regulations (SOX, GDPR, etc.)
                       • Real-time compliance monitoring required
                       • Heavy penalties for non-compliance
                       • Mitigation: Automated compliance systems, legal expertise

                    2. **Cybersecurity Threats** (Severity: Critical)
                       • Financial systems prime hacking targets
                       • Data breaches can cost millions
                       • Customer trust highly sensitive to breaches
                       • Mitigation: Multi-layer security, regular audits, insurance

                    3. **Market Volatility** (Severity: High)
                       • Economic conditions affect trading volumes
                       • Interest rate changes impact profitability
                       • Geopolitical events create uncertainty
                       • Mitigation: Diversification, hedging strategies, scenario planning

                    4. **Technology Integration** (Severity: Medium-High)
                       • Legacy systems integration challenges
                       • Real-time processing requirements
                       • High availability demands (99.999% uptime)
                       • Mitigation: Phased migration, parallel systems, extensive testing

                    **Risk Mitigation Framework:**
                    • Implement zero-trust security architecture
                    • Develop comprehensive compliance automation
                    • Create robust disaster recovery plans
                    • Maintain regulatory change monitoring systems
                    • Build strong cybersecurity partnerships

                    **Overall Risk Assessment:** High
                    **Recommended Risk Budget:** 25-30% of annual revenue
                `
            }
        };

        const marketData = analyses[market] || analyses.technology;
        return marketData[focus.toLowerCase().replace(' ', '_')] || marketData.growth_potential;
    }

    showTaskResult(element, content, type) {
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

    setupLiveSync() {
        // Extend the global liveSync instance
        if (window.liveSync) {
            // Learning page can receive updates but mainly provides content
        }
    }

    saveProgress() {
        const progress = {
            currentPath: this.currentPath,
            completedModules: this.getCompletedModules(),
            lastAccessed: new Date().toISOString()
        };

        localStorage.setItem('bridge-learning-progress', JSON.stringify(progress));
    }

    loadProgress() {
        try {
            const progress = JSON.parse(localStorage.getItem('bridge-learning-progress'));
            if (progress && progress.currentPath) {
                this.currentPath = progress.currentPath;
                this.switchPath(this.currentPath);
            }
        } catch (error) {
            console.warn('Failed to load learning progress:', error);
        }
    }

    getCompletedModules() {
        // Track completed interactive modules
        const completed = [];

        if (document.getElementById('causal-result').textContent.trim()) {
            completed.push('causal-analysis');
        }

        if (document.getElementById('task-result').textContent.trim()) {
            completed.push('economic-analysis');
        }

        return completed;
    }
}

// Add learning-specific styles
const learnStyles = document.createElement('style');
learnStyles.textContent = `
.learn-header {
    background: linear-gradient(135deg, var(--background-primary), var(--background-secondary));
    padding: 4rem 0 2rem;
    text-align: center;
}

.learn-header h1 {
    font-size: 3rem;
    margin-bottom: 1rem;
    background: linear-gradient(135deg, var(--primary-color), var(--accent-color));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.learn-subtitle {
    font-size: 1.2rem;
    color: var(--text-secondary);
    max-width: 700px;
    margin: 0 auto;
}

.learning-paths {
    padding: 3rem 0;
    background: var(--background-primary);
}

.paths-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 2rem;
}

.path-card {
    background: var(--background-secondary);
    border: 1px solid var(--border-color);
    border-radius: 16px;
    padding: 2rem;
    text-align: center;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
}

.path-card.beginner {
    border-color: var(--success-color);
}

.path-card.intermediate {
    border-color: var(--warning-color);
}

.path-card.advanced {
    border-color: var(--error-color);
}

.path-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, var(--primary-color), var(--accent-color));
}

.path-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 15px 35px var(--shadow-color);
}

.path-header {
    margin-bottom: 1.5rem;
}

.path-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
}

.path-card h3 {
    color: var(--primary-color);
    margin-bottom: 0.5rem;
    font-size: 1.5rem;
}

.path-level {
    color: var(--text-secondary);
    font-size: 0.9rem;
    font-weight: 600;
}

.path-card p {
    color: var(--text-secondary);
    margin-bottom: 1.5rem;
    line-height: 1.6;
}

.path-modules {
    text-align: left;
    margin-bottom: 1.5rem;
}

.path-modules .module {
    color: var(--text-secondary);
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
    padding-left: 1rem;
    position: relative;
}

.path-modules .module::before {
    content: '•';
    position: absolute;
    left: 0;
    color: var(--primary-color);
    font-weight: 700;
}

.path-btn {
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

.path-btn:hover,
.path-btn.active {
    background: var(--secondary-color);
}

.learning-content {
    padding: 3rem 0;
    background: var(--background-secondary);
}

.learning-module {
    background: var(--background-primary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 2rem;
    margin-bottom: 2rem;
}

.learning-module h3 {
    color: var(--primary-color);
    margin-bottom: 1.5rem;
    font-size: 1.25rem;
}

.module-content {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 2rem;
}

.content-text {
    line-height: 1.7;
}

.content-text p {
    margin-bottom: 1rem;
    color: var(--text-secondary);
}

.interactive-example {
    background: var(--background-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1.5rem;
    margin: 1.5rem 0;
}

.interactive-example h4 {
    color: var(--primary-color);
    margin-bottom: 1rem;
}

.interactive-example ul {
    margin: 1rem 0;
    padding-left: 1.5rem;
}

.interactive-example li {
    margin-bottom: 0.5rem;
    color: var(--text-secondary);
}

.causal-demo {
    margin-top: 1rem;
}

.content-visual {
    display: flex;
    align-items: center;
    justify-content: center;
}

.causal-diagram {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 1.1rem;
    font-weight: 600;
}

.diagram-node {
    background: var(--background-tertiary);
    border: 2px solid var(--primary-color);
    border-radius: 8px;
    padding: 1rem;
    text-align: center;
}

.diagram-arrow {
    color: var(--primary-color);
    font-size: 1.5rem;
}

.code-example {
    background: var(--background-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1.5rem;
    margin: 1.5rem 0;
}

.code-example h4 {
    color: var(--primary-color);
    margin-bottom: 1rem;
}

.code-example pre {
    background: var(--background-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 1rem;
    overflow-x: auto;
    margin: 0;
}

.task-demo {
    background: var(--background-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1.5rem;
    margin: 1.5rem 0;
}

.task-builder {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1rem;
    align-items: center;
    margin-bottom: 1rem;
}

.task-builder label {
    font-weight: 600;
    color: var(--text-primary);
}

.task-builder select,
.task-builder input {
    padding: 0.5rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-primary);
}

.content-section {
    display: none;
}

.content-section:not(.hidden) {
    display: block;
}

.resources-section {
    padding: 4rem 0;
    background: var(--background-primary);
}

.resources-section h2 {
    text-align: center;
    margin-bottom: 3rem;
    color: var(--primary-color);
}

.resources-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
}

.resource-card {
    background: var(--background-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 2rem;
    text-align: center;
    transition: all 0.3s ease;
}

.resource-card:hover {
    border-color: var(--primary-color);
    box-shadow: 0 8px 25px var(--shadow-color);
}

.resource-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
}

.resource-card h3 {
    color: var(--primary-color);
    margin-bottom: 1rem;
}

.resource-card p {
    color: var(--text-secondary);
    margin-bottom: 1.5rem;
    line-height: 1.6;
}

.resource-link {
    color: var(--accent-color);
    text-decoration: none;
    font-weight: 600;
    transition: color 0.3s ease;
}

.resource-link:hover {
    color: var(--primary-color);
}

@media (max-width: 768px) {
    .learn-header h1 {
        font-size: 2rem;
    }

    .paths-grid {
        grid-template-columns: 1fr;
    }

    .module-content {
        grid-template-columns: 1fr;
    }

    .causal-diagram {
        flex-direction: column;
        gap: 0.5rem;
    }

    .diagram-arrow {
        transform: rotate(90deg);
    }
}
`;
document.head.appendChild(learnStyles);

// Initialize learn page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.learnPage = new LearnPage();
});