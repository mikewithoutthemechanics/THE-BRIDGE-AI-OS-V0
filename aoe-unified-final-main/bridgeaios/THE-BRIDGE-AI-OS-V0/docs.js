// THE BRIDGE AI OS - Documentation JavaScript
// Interactive documentation with live sync

class Docs {
    constructor() {
        this.currentSection = 'getting-started';
        this.searchTerm = '';

        this.init();
    }

    init() {
        this.setupNavigation();
        this.setupSearch();
        this.setupLiveSync();
        this.loadInitialContent();
        this.setupScrollSpy();
    }

    setupNavigation() {
        const menuItems = document.querySelectorAll('.docs-menu-item');

        menuItems.forEach(item => {
            item.addEventListener('click', () => {
                const section = item.dataset.section || item.getAttribute('href').substring(1);

                // Update active menu item
                menuItems.forEach(mi => mi.classList.remove('active'));
                item.classList.add('active');

                this.showSection(section);
            });
        });
    }

    setupSearch() {
        // Add search functionality
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search documentation...';
        searchInput.className = 'docs-search';

        const sidebar = document.querySelector('.docs-sidebar');
        if (sidebar) {
            sidebar.insertBefore(searchInput, sidebar.firstChild);

            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.filterContent();
            });
        }
    }

    setupLiveSync() {
        // Extend the global liveSync instance
        if (window.liveSync) {
            // Docs page doesn't need live updates currently
            // But we can add real-time documentation updates here
        }
    }

    setupScrollSpy() {
        const sections = document.querySelectorAll('.docs-section');
        const menuItems = document.querySelectorAll('.docs-menu-item');

        const observerOptions = {
            rootMargin: '-50% 0px -50% 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const sectionId = entry.target.id;
                    menuItems.forEach(item => {
                        item.classList.toggle('active', item.getAttribute('href') === `#${sectionId}`);
                    });
                }
            });
        }, observerOptions);

        sections.forEach(section => observer.observe(section));
    }

    showSection(sectionId) {
        // Hide all sections
        document.querySelectorAll('.docs-section').forEach(section => {
            section.style.display = 'none';
        });

        // Show selected section
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.style.display = 'block';

            // Smooth scroll to section
            targetSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }

        this.currentSection = sectionId;
    }

    filterContent() {
        const sections = document.querySelectorAll('.docs-section');
        const menuItems = document.querySelectorAll('.docs-menu-item');

        if (!this.searchTerm) {
            // Show all sections and reset menu
            sections.forEach(section => section.style.display = 'block');
            menuItems.forEach(item => item.style.display = 'block');
            return;
        }

        sections.forEach(section => {
            const content = section.textContent.toLowerCase();
            const matches = content.includes(this.searchTerm);
            section.style.display = matches ? 'block' : 'none';
        });

        // Update menu visibility
        menuItems.forEach(item => {
            const sectionId = item.getAttribute('href').substring(1);
            const section = document.getElementById(sectionId);
            const matches = section && section.textContent.toLowerCase().includes(this.searchTerm);
            item.style.display = matches ? 'block' : 'none';
        });
    }

    loadInitialContent() {
        // Show getting started by default
        this.showSection('getting-started');
    }

    // Interactive code examples
    setupCodeExamples() {
        const codeBlocks = document.querySelectorAll('pre code');

        codeBlocks.forEach(block => {
            // Add copy button
            const copyButton = document.createElement('button');
            copyButton.className = 'copy-button';
            copyButton.textContent = 'Copy';
            copyButton.onclick = () => this.copyToClipboard(block.textContent, copyButton);

            const pre = block.parentElement;
            pre.style.position = 'relative';
            pre.appendChild(copyButton);
        });
    }

    copyToClipboard(text, button) {
        navigator.clipboard.writeText(text).then(() => {
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            button.style.background = 'var(--success-color)';

            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = '';
            }, 2000);
        });
    }

    // API endpoint testing
    setupAPITesting() {
        const endpoints = document.querySelectorAll('.endpoint-card');

        endpoints.forEach(card => {
            const testButton = document.createElement('button');
            testButton.className = 'test-endpoint-btn';
            testButton.textContent = 'Test Endpoint';
            testButton.onclick = () => this.testEndpoint(card);

            card.appendChild(testButton);
        });
    }

    async testEndpoint(card) {
        const method = card.querySelector('.endpoint-method').textContent;
        const path = card.querySelector('.endpoint-path').textContent;

        const button = card.querySelector('.test-endpoint-btn');
        const originalText = button.textContent;

        button.textContent = 'Testing...';
        button.disabled = true;

        try {
            const response = await fetch(path);
            const data = await response.json();

            // Show response
            let responseElement = card.querySelector('.endpoint-response');
            if (!responseElement) {
                responseElement = document.createElement('div');
                responseElement.className = 'endpoint-response';
                card.appendChild(responseElement);
            }

            responseElement.innerHTML = `
                <strong>Response (${response.status}):</strong>
                <pre><code>${JSON.stringify(data, null, 2)}</code></pre>
            `;

            button.textContent = '✅ Success';
            button.style.background = 'var(--success-color)';

        } catch (error) {
            button.textContent = '❌ Failed';
            button.style.background = 'var(--error-color)';
            console.error('API test failed:', error);
        }

        setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
            button.style.background = '';
        }, 3000);
    }
}

// Add documentation-specific styles
const docsStyles = document.createElement('style');
docsStyles.textContent = `
.docs-header {
    background: linear-gradient(135deg, var(--background-primary), var(--background-secondary));
    padding: 4rem 0 2rem;
    text-align: center;
}

.docs-header h1 {
    font-size: 3rem;
    margin-bottom: 1rem;
    background: linear-gradient(135deg, var(--primary-color), var(--accent-color));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.docs-header p {
    font-size: 1.2rem;
    color: var(--text-secondary);
    max-width: 600px;
    margin: 0 auto;
}

.docs-nav {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 3rem;
    padding: 3rem 0;
}

.docs-sidebar {
    position: sticky;
    top: 100px;
    height: fit-content;
}

.docs-search {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--background-secondary);
    color: var(--text-primary);
    margin-bottom: 1rem;
    font-size: 0.9rem;
}

.docs-search:focus {
    outline: none;
    border-color: var(--primary-color);
}

.docs-menu {
    background: var(--background-secondary);
    border-radius: 12px;
    padding: 1rem;
    border: 1px solid var(--border-color);
}

.docs-menu-item {
    display: block;
    padding: 0.75rem 1rem;
    color: var(--text-secondary);
    text-decoration: none;
    border-radius: 8px;
    margin-bottom: 0.25rem;
    transition: all 0.3s ease;
    font-weight: 500;
}

.docs-menu-item:hover,
.docs-menu-item.active {
    background: var(--primary-color);
    color: white;
}

.docs-section {
    display: none;
    margin-bottom: 3rem;
}

.docs-section h2 {
    font-size: 2rem;
    color: var(--primary-color);
    margin-bottom: 2rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid var(--border-color);
}

.docs-content-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    margin-bottom: 2rem;
}

.docs-article {
    background: var(--background-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 1.5rem;
    transition: all 0.3s ease;
}

.docs-article:hover {
    border-color: var(--primary-color);
    box-shadow: 0 4px 15px var(--shadow-color);
}

.docs-article h3 {
    color: var(--primary-color);
    margin-bottom: 1rem;
    font-size: 1.25rem;
}

.docs-article p {
    color: var(--text-secondary);
    line-height: 1.6;
}

.endpoint-card {
    background: var(--background-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    transition: all 0.3s ease;
    position: relative;
}

.endpoint-card:hover {
    border-color: var(--primary-color);
    box-shadow: 0 4px 15px var(--shadow-color);
}

.endpoint-method {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
}

.endpoint-method {
    background: var(--success-color);
    color: white;
}

.endpoint-path {
    font-family: 'Monaco', monospace;
    font-size: 1.1rem;
    color: var(--primary-color);
    margin-bottom: 0.5rem;
    font-weight: 600;
}

.endpoint-card p {
    color: var(--text-secondary);
    margin-bottom: 1rem;
}

.endpoint-request,
.endpoint-response {
    background: var(--background-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1rem;
    margin-top: 1rem;
}

.endpoint-request strong,
.endpoint-response strong {
    color: var(--accent-color);
    display: block;
    margin-bottom: 0.5rem;
}

.endpoint-response pre {
    background: var(--background-primary);
    border: none;
    margin: 0;
}

.copy-button,
.test-endpoint-btn {
    position: absolute;
    top: 1rem;
    right: 1rem;
    padding: 0.5rem 1rem;
    background: var(--primary-color);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
    transition: background 0.3s ease;
}

.test-endpoint-btn {
    top: auto;
    bottom: 1rem;
}

.copy-button:hover,
.test-endpoint-btn:hover {
    background: var(--secondary-color);
}

pre {
    position: relative;
    background: var(--background-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1rem;
    overflow-x: auto;
    margin: 1rem 0;
}

code {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.9rem;
    color: var(--accent-color);
}

@media (max-width: 768px) {
    .docs-nav {
        grid-template-columns: 1fr;
        gap: 2rem;
    }

    .docs-sidebar {
        position: static;
    }

    .docs-content-grid {
        grid-template-columns: 1fr;
    }

    .docs-header h1 {
        font-size: 2rem;
    }
}
`;
document.head.appendChild(docsStyles);

// Initialize documentation when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.docs = new Docs();
});