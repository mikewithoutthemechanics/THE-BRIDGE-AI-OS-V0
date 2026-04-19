// THE BRIDGE AI OS - Homepage JavaScript

// MCP Configuration
const MCP_CONFIG = {
  mcpServers: {
    "wpcom-mcp": {
      url: "https://public-api.wordpress.com/wpcom/v2/mcp/v1"
    }
  }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupNavigation();
    setupAnimations();
    initializeMCPStatus();
    startStatsCounter();
});

// Main initialization
function initializeApp() {
    console.log('🌉 THE BRIDGE AI OS Homepage Initialized');

    // Add loading animation to terminal
    setTimeout(() => {
        addTerminalLines();
    }, 1000);
}

// Navigation setup
function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');

    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const targetSection = document.getElementById(targetId);

            if (targetSection) {
                targetSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });

                // Update active nav link
                navLinks.forEach(l => l.classList.remove('active'));
                this.classList.add('active');
            }
        });
    });
}

// Animation setup
function setupAnimations() {
    // Intersection Observer for fade-in animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe all feature cards and economy steps
    document.querySelectorAll('.feature-card, .economy-step').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
}

// Stats counter animation
function startStatsCounter() {
    const stats = document.querySelectorAll('.stat-number');

    stats.forEach(stat => {
        const target = parseInt(stat.getAttribute('data-target'));
        const increment = target / 100;
        let current = 0;

        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                stat.textContent = target.toLocaleString();
                clearInterval(timer);
            } else {
                stat.textContent = Math.floor(current).toLocaleString();
            }
        }, 20);
    });
}

// Terminal animation
function addTerminalLines() {
    const terminalContent = document.querySelector('.terminal-content');
    const lines = [
        '$ bridge-ai system-status',
        '🧠 Intelligence Engine: ACTIVE',
        '💰 Economic Cycles: RUNNING',
        '🔄 Event Bus: OPERATIONAL',
        '📊 Revenue Forecasting: OPTIMIZED',
        '✅ All systems nominal - Welcome to THE BRIDGE AI OS'
    ];

    let lineIndex = 0;
    const addLine = () => {
        if (lineIndex < lines.length) {
            const lineElement = document.createElement('div');
            lineElement.className = 'terminal-line';
            lineElement.textContent = lines[lineIndex];
            terminalContent.appendChild(lineElement);
            lineIndex++;
            setTimeout(addLine, 800);
        }
    };

    addLine();
}

// MCP Status initialization
function initializeMCPStatus() {
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');

    // Check MCP connection
    checkMCPStatus()
        .then(success => {
            if (success) {
                statusIndicator.textContent = '✅';
                statusText.textContent = 'MCP Connected';
                statusIndicator.style.color = '#10b981';
            } else {
                statusIndicator.textContent = '❌';
                statusText.textContent = 'MCP Connection Failed';
                statusIndicator.style.color = '#ef4444';
            }
        })
        .catch(error => {
            console.error('MCP Status check failed:', error);
            statusIndicator.textContent = '⚠️';
            statusText.textContent = 'MCP Check Error';
            statusIndicator.style.color = '#f59e0b';
        });
}

// MCP connection check
async function checkMCPStatus() {
    try {
        // Simple fetch to check if MCP endpoint is reachable
        const response = await fetch(MCP_CONFIG.mcpServers["wpcom-mcp"].url, {
            method: 'HEAD',
            mode: 'no-cors'
        });

        // Since we're using no-cors, we can't check the actual response
        // but if no error is thrown, consider it "connected"
        return true;
    } catch (error) {
        console.warn('MCP connection check:', error);
        return false;
    }
}

// Demo functions
function startDemo() {
    alert('🚀 Starting THE BRIDGE AI OS Demo!\n\nThis would normally:\n1. Initialize the AI Brain\n2. Start Economic Intelligence Cycles\n3. Begin Opportunity Generation\n4. Launch Revenue Forecasting\n\nDemo features coming soon!');
}

function exploreDocs() {
    window.open('docs/prompts/README.md', '_blank');
}

function startIntegration() {
    const contactSection = document.getElementById('contact');
    contactSection.scrollIntoView({ behavior: 'smooth' });

    setTimeout(() => {
        alert('🔧 Integration Guide:\n\n1. Install Node.js dependencies\n2. Configure MCP settings\n3. Initialize AI Engine\n4. Start Economic Cycles\n5. Deploy to production\n\nContact us for full integration support!');
    }, 500);
}

function scheduleDemo() {
    alert('📅 Demo Scheduling:\n\nAvailable time slots:\n• Monday 2:00 PM EST\n• Wednesday 10:00 AM EST\n• Friday 3:00 PM EST\n\nSend us an email to schedule your personalized demo!');
}

// Smooth scrolling for all anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Add some interactive effects
document.addEventListener('mousemove', (e) => {
    const cursor = document.querySelector('.hero-visual');
    if (cursor) {
        const x = (e.clientX / window.innerWidth - 0.5) * 20;
        const y = (e.clientY / window.innerHeight - 0.5) * 20;
        cursor.style.transform = `translate(${x}px, ${y}px)`;
    }
});

// Console branding
console.log(`
🌉 THE BRIDGE AI OS
═══════════════════════════════════════════
Causal AI Economy System - v1.0.0
Intelligence Engine: ACTIVE
Economic Cycles: READY
Event Bus: OPERATIONAL
═══════════════════════════════════════════
Welcome to the future of AI economics!
`);