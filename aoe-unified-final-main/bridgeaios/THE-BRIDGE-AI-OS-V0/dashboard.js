// THE BRIDGE AI OS - Dashboard JavaScript
// Real-time dashboard with live metrics and charts

class Dashboard {
    constructor() {
        this.charts = {};
        this.activityData = [];
        this.metricHistory = {
            intelligence: [],
            opportunities: [],
            performance: [],
            mcp: []
        };
        this.maxHistoryPoints = 60; // 1 hour of data at 1-minute intervals

        this.init();
    }

    init() {
        this.initializeCharts();
        this.setupLiveSync();
        this.startDataPolling();
        this.loadInitialData();
    }

    initializeCharts() {
        const ctxIntelligence = document.getElementById('intelligence-chart');
        const ctxOpportunities = document.getElementById('opportunities-chart');
        const ctxPerformance = document.getElementById('performance-chart');
        const ctxMCP = document.getElementById('mcp-chart');

        if (ctxIntelligence) {
            this.charts.intelligence = new Chart(ctxIntelligence, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Intelligence Cycles',
                        data: [],
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: { beginAtZero: true }
                    },
                    animation: {
                        duration: 1000,
                        easing: 'easeInOutQuart'
                    }
                }
            });
        }

        // Initialize other charts similarly...
        [ctxOpportunities, ctxPerformance, ctxMCP].forEach((ctx, index) => {
            if (ctx) {
                const chartName = ['opportunities', 'performance', 'mcp'][index];
                this.charts[chartName] = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [{
                            label: this.getChartLabel(chartName),
                            data: [],
                            borderColor: this.getChartColor(chartName),
                            backgroundColor: this.getChartBackgroundColor(chartName),
                            tension: 0.4,
                            fill: true
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false }
                        },
                        scales: {
                            y: { beginAtZero: true }
                        },
                        animation: {
                            duration: 1000,
                            easing: 'easeInOutQuart'
                        }
                    }
                });
            }
        });
    }

    getChartLabel(name) {
        const labels = {
            opportunities: 'Economic Opportunities',
            performance: 'System Performance',
            mcp: 'MCP Requests'
        };
        return labels[name] || name;
    }

    getChartColor(name) {
        const colors = {
            opportunities: '#10b981',
            performance: '#f59e0b',
            mcp: '#8b5cf6'
        };
        return colors[name] || '#2563eb';
    }

    getChartBackgroundColor(name) {
        const colors = {
            opportunities: 'rgba(16, 185, 129, 0.1)',
            performance: 'rgba(245, 158, 11, 0.1)',
            mcp: 'rgba(139, 92, 246, 0.1)'
        };
        return colors[name] || 'rgba(37, 99, 235, 0.1)';
    }

    setupLiveSync() {
        // Extend the global liveSync instance
        if (window.liveSync) {
            window.liveSync.updateSystemStatus = (status) => this.updateSystemStatus(status);
            window.liveSync.updateEconomicMetrics = (data) => this.updateEconomicMetrics(data);
            window.liveSync.updateIntelligenceMetrics = (data) => this.updateIntelligenceMetrics(data);
            window.liveSync.updateActivityFeed = (activities) => this.updateActivityFeed(activities);
        }
    }

    updateSystemStatus(status) {
        const statusElement = document.getElementById('system-status');
        const lastUpdateElement = document.getElementById('last-update');

        if (statusElement) {
            const statusText = status.intelligence_engine === 'ACTIVE' ? 'Operational' : 'Issues Detected';
            const statusClass = status.intelligence_engine === 'ACTIVE' ? 'success' : 'error';

            statusElement.innerHTML = `
                <span class="status-dot status-${statusClass.toLowerCase()}"></span>
                <span class="status-text">${statusText}</span>
            `;
        }

        if (lastUpdateElement) {
            lastUpdateElement.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
        }
    }

    updateEconomicMetrics(data) {
        this.updateMetric('opportunities-found', data.opportunities_created || 0);
        this.updateMetric('revenue-forecast', `$${data.revenue_forecasted?.toLocaleString() || '0'}`);

        // Update chart data
        this.addChartData('opportunities', data.opportunities_created || 0);
    }

    updateIntelligenceMetrics(data) {
        this.updateMetric('intelligence-cycles', data.cycles_completed || 0);
        this.updateMetric('intelligence-success', `${data.success_rate || 0}%`);
        this.updateMetric('intelligence-response', `${data.avg_response_time || 0}ms`);

        // Update chart data
        this.addChartData('intelligence', data.cycles_completed || 0);
    }

    updateActivityFeed(activities) {
        const feedElement = document.getElementById('activity-list');
        if (!feedElement) return;

        // Clear loading state
        const loadingElement = feedElement.querySelector('.loading');
        if (loadingElement) {
            loadingElement.remove();
        }

        // Add new activities
        activities.forEach(activity => {
            const activityElement = document.createElement('div');
            activityElement.className = 'activity-item';
            activityElement.innerHTML = `
                <div class="activity-icon">${this.getActivityIcon(activity.type)}</div>
                <div class="activity-content">
                    <div class="activity-message">${activity.message}</div>
                    <div class="activity-time">${this.formatTime(activity.timestamp)}</div>
                </div>
            `;

            // Insert at the top
            feedElement.insertBefore(activityElement, feedElement.firstChild);

            // Animate in
            setTimeout(() => {
                activityElement.style.opacity = '1';
                activityElement.style.transform = 'translateY(0)';
            }, 100);
        });

        // Keep only last 50 activities
        while (feedElement.children.length > 50) {
            feedElement.removeChild(feedElement.lastChild);
        }
    }

    getActivityIcon(type) {
        const icons = {
            intelligence: '🧠',
            economic: '💰',
            system: '⚙️',
            mcp: '🔗',
            user: '👤',
            error: '❌',
            success: '✅'
        };
        return icons[type] || '📢';
    }

    formatTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    }

    updateMetric(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
            element.style.animation = 'none';
            element.offsetHeight; // Trigger reflow
            element.style.animation = 'metricUpdate 0.5s ease';
        }
    }

    addChartData(chartName, value) {
        const chart = this.charts[chartName];
        if (!chart) return;

        const now = new Date();
        const timeLabel = now.toLocaleTimeString();

        // Add new data point
        chart.data.labels.push(timeLabel);
        chart.data.datasets[0].data.push(value);

        // Remove old data points
        if (chart.data.labels.length > this.maxHistoryPoints) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
        }

        chart.update('none'); // Update without animation for performance
    }

    startDataPolling() {
        // Poll for data every 30 seconds as backup to live sync
        setInterval(() => {
            if (!window.liveSync || !window.liveSync.isConnected) {
                this.loadInitialData();
            }
        }, 30000);
    }

    async loadInitialData() {
        try {
            const [healthRes, systemRes, economicRes] = await Promise.all([
                fetch('/api/health'),
                fetch('/api/system-status'),
                fetch('/api/economic-data')
            ]);

            if (healthRes.ok) {
                const health = await healthRes.json();
                this.updateSystemStatus(health);
            }

            if (systemRes.ok) {
                const system = await systemRes.json();
                this.updateSystemStatus(system);
            }

            if (economicRes.ok) {
                const economic = await economicRes.json();
                this.updateEconomicMetrics(economic);
                this.updateIntelligenceMetrics(economic);
            }
        } catch (error) {
            console.error('Failed to load initial data:', error);
        }
    }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
@keyframes metricUpdate {
    0% { transform: scale(1); }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); }
}

.activity-item {
    display: flex;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--border-color);
    opacity: 0;
    transform: translateY(-10px);
    transition: all 0.3s ease;
}

.activity-item:first-child {
    border-top: 1px solid var(--border-color);
}

.activity-icon {
    font-size: 1.5rem;
    margin-right: 1rem;
}

.activity-content {
    flex: 1;
}

.activity-message {
    color: var(--text-primary);
    margin-bottom: 0.25rem;
}

.activity-time {
    color: var(--text-muted);
    font-size: 0.8rem;
}

.status-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 0.5rem;
    animation: pulse 2s infinite;
}

.status-success {
    background: var(--success-color);
}

.status-error {
    background: var(--error-color);
}

@keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
}
`;
document.head.appendChild(style);

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new Dashboard();
});