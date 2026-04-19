// THE BRIDGE AI OS - Connect Page JavaScript
// Integration setup, contact forms, and partnership management

class ConnectPage {
    constructor() {
        this.currentStep = 1;
        this.selectedPath = 'api';
        this.credentials = null;

        this.init();
    }

    init() {
        this.setupQuickStart();
        this.setupContactForm();
        this.setupLiveSync();
        this.setupDemoButtons();
    }

    setupQuickStart() {
        // Step navigation
        const optionButtons = document.querySelectorAll('.option-btn');
        optionButtons.forEach(button => {
            button.addEventListener('click', () => {
                const option = button.dataset.option;
                this.selectIntegrationPath(option);
            });
        });

        // Credential generation
        const getCredentialsBtn = document.getElementById('get-credentials-btn');
        const emailInput = document.getElementById('integration-email');
        const typeSelect = document.getElementById('integration-type');

        if (getCredentialsBtn) {
            getCredentialsBtn.addEventListener('click', () => {
                const email = emailInput.value.trim();
                const type = typeSelect.value;

                if (!email || !type) {
                    this.showCredentialsMessage('Please fill in all fields', 'error');
                    return;
                }

                if (!this.isValidEmail(email)) {
                    this.showCredentialsMessage('Please enter a valid email address', 'error');
                    return;
                }

                this.generateCredentials(email, type);
            });
        }
    }

    selectIntegrationPath(path) {
        this.selectedPath = path;

        // Update UI
        const optionButtons = document.querySelectorAll('.option-btn');
        optionButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.option === path) {
                btn.classList.add('active');
            }
        });

        // Update step content
        this.updateQuickStartContent();
    }

    updateQuickStartContent() {
        const stepCard = document.querySelector('.step-card:nth-child(1)');
        if (stepCard) {
            const content = stepCard.querySelector('p');
            const descriptions = {
                api: 'REST API integration for programmatic access to economic intelligence',
                mcp: 'Model Context Protocol for seamless AI tool integration',
                sdk: 'Software Development Kit for custom application development'
            };

            if (content) {
                content.textContent = descriptions[this.selectedPath] || descriptions.api;
            }
        }
    }

    async generateCredentials(email, type) {
        const credentialsBtn = document.getElementById('get-credentials-btn');
        const originalText = credentialsBtn.textContent;

        credentialsBtn.textContent = 'Generating...';
        credentialsBtn.disabled = true;

        try {
            const response = await fetch('/api/integration/credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, type })
            });

            if (response.ok) {
                const data = await response.json();
                this.credentials = data;
                this.showCredentials(data);
            } else {
                throw new Error('Failed to generate credentials');
            }
        } catch (error) {
            console.error('Credential generation error:', error);
            this.showCredentialsMessage('Failed to generate credentials. Please try again.', 'error');
        } finally {
            credentialsBtn.textContent = originalText;
            credentialsBtn.disabled = false;
        }
    }

    showCredentials(credentials) {
        const resultDiv = document.getElementById('credentials-result');
        if (!resultDiv) return;

        let credentialsHTML = `
            <div class="credentials-success">
                <h4>✅ Credentials Generated Successfully!</h4>
                <p>Your integration credentials have been sent to <strong>${credentials.email}</strong></p>
                <div class="credentials-details">
        `;

        if (credentials.apiKey) {
            credentialsHTML += `
                <div class="credential-item">
                    <label>API Key:</label>
                    <code class="credential-code">${credentials.apiKey}</code>
                    <button onclick="navigator.clipboard.writeText('${credentials.apiKey}')" class="copy-btn">Copy</button>
                </div>
            `;
        }

        if (credentials.endpoint) {
            credentialsHTML += `
                <div class="credential-item">
                    <label>Endpoint:</label>
                    <code class="credential-code">${credentials.endpoint}</code>
                    <button onclick="navigator.clipboard.writeText('${credentials.endpoint}')" class="copy-btn">Copy</button>
                </div>
            `;
        }

        if (credentials.documentation) {
            credentialsHTML += `
                <div class="credential-item">
                    <label>Documentation:</label>
                    <a href="${credentials.documentation}" target="_blank">${credentials.documentation}</a>
                </div>
            `;
        }

        credentialsHTML += `
                </div>
                <div class="credentials-next">
                    <p><strong>Next Steps:</strong></p>
                    <ol>
                        <li>Save your API key securely</li>
                        <li>Review the documentation</li>
                        <li>Start building your integration</li>
                        <li>Contact support if you need help</li>
                    </ol>
                </div>
            </div>
        `;

        resultDiv.innerHTML = credentialsHTML;
    }

    showCredentialsMessage(message, type) {
        const resultDiv = document.getElementById('credentials-result');
        if (resultDiv) {
            resultDiv.innerHTML = `<div class="credentials-message ${type}">${message}</div>`;
        }
    }

    setupContactForm() {
        const form = document.getElementById('connect-form');
        const messageElement = document.getElementById('connect-form-message');

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                const formData = new FormData(form);
                const data = Object.fromEntries(formData.entries());

                // Validate form
                if (!this.validateContactForm(data)) {
                    return;
                }

                // Show loading state
                this.showFormMessage('Sending your message...', 'info');
                const submitBtn = form.querySelector('button[type="submit"]');
                submitBtn.disabled = true;
                submitBtn.textContent = 'Sending...';

                try {
                    const response = await fetch('/api/contact', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });

                    if (response.ok) {
                        const result = await response.json();
                        this.showFormMessage(`Message sent successfully! Your ticket ID is ${result.ticket_id}. We'll get back to you within 24 hours.`, 'success');
                        form.reset();
                    } else {
                        throw new Error('Failed to send message');
                    }
                } catch (error) {
                    console.error('Contact form error:', error);
                    this.showFormMessage('Failed to send message. Please try again or contact us directly at support@thebridgeaios.com.', 'error');
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Send Message';
                }
            });
        }
    }

    validateContactForm(data) {
        const requiredFields = ['firstName', 'lastName', 'email', 'inquiryType', 'message'];

        for (const field of requiredFields) {
            if (!data[field] || !data[field].trim()) {
                this.showFormMessage(`Please fill in the ${field.replace(/([A-Z])/g, ' $1').toLowerCase()} field.`, 'error');
                return false;
            }
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
            this.showFormMessage('Please enter a valid email address.', 'error');
            return false;
        }

        // Combine first and last name
        data.name = `${data.firstName} ${data.lastName}`;

        return true;
    }

    showFormMessage(message, type) {
        const messageElement = document.getElementById('connect-form-message');
        if (messageElement) {
            messageElement.textContent = message;
            messageElement.className = `form-message ${type}`;
            messageElement.style.display = 'block';

            // Auto-hide success messages
            if (type === 'success') {
                setTimeout(() => {
                    messageElement.style.display = 'none';
                }, 10000);
            }
        }
    }

    setupLiveSync() {
        // Extend the global liveSync instance
        if (window.liveSync) {
            // Connect page can receive updates but mainly handles form submissions
        }
    }

    setupDemoButtons() {
        // Showcase tabs
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tab = button.dataset.tab;

                // Update active tab
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                // Show corresponding content
                tabContents.forEach(content => {
                    content.classList.remove('active');
                    if (content.dataset.tab === tab) {
                        content.classList.add('active');
                    }
                });
            });
        });
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
}

// Live chat functionality
function startSupportChat() {
    const chatWidget = document.getElementById('live-chat-widget');
    if (chatWidget) {
        chatWidget.style.display = 'block';
        // In a real implementation, this would initialize a chat session
        alert('Live chat support is currently in development. Please use the contact form or email support@thebridgeaios.com for immediate assistance.');
    }
}

// Add connect-specific styles
const connectStyles = document.createElement('style');
connectStyles.textContent = `
.connect-header {
    background: linear-gradient(135deg, var(--background-primary), var(--background-secondary));
    padding: 4rem 0 2rem;
    text-align: center;
}

.connect-header h1 {
    font-size: 3rem;
    margin-bottom: 1rem;
    background: linear-gradient(135deg, var(--primary-color), var(--accent-color));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.connect-subtitle {
    font-size: 1.2rem;
    color: var(--text-secondary);
    max-width: 700px;
    margin: 0 auto;
}

.connection-options {
    padding: 3rem 0;
    background: var(--background-primary);
}

.connection-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
}

.connection-card {
    background: var(--background-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 2rem;
    text-align: center;
    transition: all 0.3s ease;
}

.connection-card.primary {
    border-color: var(--primary-color);
    box-shadow: 0 4px 15px rgba(37, 99, 235, 0.2);
}

.connection-card.support {
    border-color: var(--success-color);
    box-shadow: 0 4px 15px rgba(16, 185, 129, 0.2);
}

.connection-card.partnership {
    border-color: var(--warning-color);
    box-shadow: 0 4px 15px rgba(245, 158, 11, 0.2);
}

.connection-card.enterprise {
    border-color: var(--secondary-color);
    box-shadow: 0 4px 15px rgba(168, 85, 247, 0.2);
}

.connection-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 8px 25px var(--shadow-color);
}

.connection-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
}

.connection-card h3 {
    color: var(--primary-color);
    margin-bottom: 1rem;
}

.connection-card p {
    color: var(--text-secondary);
    margin-bottom: 1.5rem;
}

.connection-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.connection-btn {
    background: transparent;
    border: 2px solid var(--border-color);
    color: var(--text-primary);
    padding: 0.75rem 1rem;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    text-decoration: none;
    display: inline-block;
    transition: all 0.3s ease;
}

.connection-btn.primary {
    background: var(--primary-color);
    border-color: var(--primary-color);
    color: white;
}

.connection-btn.secondary {
    border-color: var(--primary-color);
    color: var(--primary-color);
}

.connection-btn:hover {
    background: var(--primary-color);
    color: white;
}

.quick-start-section {
    padding: 4rem 0;
    background: var(--background-secondary);
}

.quick-start-steps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
    position: relative;
}

.step-arrow {
    display: none;
}

.step-card {
    background: var(--background-primary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 2rem;
    text-align: center;
    transition: all 0.3s ease;
}

.step-card:hover {
    border-color: var(--primary-color);
    box-shadow: 0 4px 15px var(--shadow-color);
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

.step-card h3 {
    color: var(--primary-color);
    margin-bottom: 1rem;
}

.step-card p {
    color: var(--text-secondary);
    margin-bottom: 1.5rem;
    line-height: 1.6;
}

.step-options {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
}

.option-btn {
    background: transparent;
    border: 2px solid var(--border-color);
    color: var(--text-secondary);
    padding: 0.5rem 1rem;
    border-radius: 20px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.3s ease;
}

.option-btn:hover,
.option-btn.active {
    background: var(--primary-color);
    border-color: var(--primary-color);
    color: white;
}

.credentials-form {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1rem;
    align-items: end;
}

.credential-input,
.credential-select {
    padding: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--background-secondary);
    color: var(--text-primary);
    font-size: 0.9rem;
}

.credential-input:focus,
.credential-select:focus {
    outline: none;
    border-color: var(--primary-color);
}

.credentials-result {
    margin-top: 1rem;
    padding: 1rem;
    border-radius: 8px;
    background: var(--background-tertiary);
    display: none;
}

.credentials-message {
    color: var(--text-primary);
}

.credentials-message.error {
    color: var(--error-color);
}

.credentials-success h4 {
    color: var(--success-color);
    margin-bottom: 1rem;
}

.credentials-details {
    margin-bottom: 1.5rem;
}

.credential-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.75rem;
    padding: 0.5rem;
    background: var(--background-primary);
    border-radius: 4px;
}

.credential-item label {
    font-weight: 600;
    color: var(--text-primary);
    min-width: 80px;
}

.credential-code {
    flex: 1;
    font-family: 'Monaco', monospace;
    background: var(--background-secondary);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    color: var(--accent-color);
    word-break: break-all;
}

.copy-btn {
    background: var(--primary-color);
    color: white;
    border: none;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
    transition: background 0.3s ease;
}

.copy-btn:hover {
    background: var(--secondary-color);
}

.credentials-next {
    border-top: 1px solid var(--border-color);
    padding-top: 1rem;
}

.credentials-next ol {
    margin: 0;
    padding-left: 1.5rem;
}

.credentials-next li {
    margin-bottom: 0.5rem;
    color: var(--text-secondary);
}

.integration-showcase {
    padding: 4rem 0;
    background: var(--background-primary);
}

.integration-showcase h2 {
    text-align: center;
    margin-bottom: 3rem;
    color: var(--primary-color);
}

.showcase-tabs {
    display: flex;
    justify-content: center;
    gap: 1rem;
    margin-bottom: 3rem;
    flex-wrap: wrap;
}

.tab-btn {
    background: transparent;
    border: 2px solid var(--border-color);
    color: var(--text-secondary);
    padding: 0.75rem 1.5rem;
    border-radius: 25px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.3s ease;
}

.tab-btn:hover,
.tab-btn.active {
    background: var(--primary-color);
    border-color: var(--primary-color);
    color: white;
}

.showcase-content {
    max-width: 1000px;
    margin: 0 auto;
}

.showcase-content .tab-content {
    display: none;
}

.showcase-content .tab-content.active {
    display: block;
}

.integration-examples {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2rem;
}

.example-card {
    background: var(--background-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 2rem;
    transition: all 0.3s ease;
}

.example-card:hover {
    border-color: var(--primary-color);
    box-shadow: 0 4px 15px var(--shadow-color);
}

.example-card h4 {
    color: var(--primary-color);
    margin-bottom: 1rem;
}

.example-card p {
    color: var(--text-secondary);
    margin-bottom: 1.5rem;
    line-height: 1.6;
}

.example-code {
    background: var(--background-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1rem;
}

.example-code pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
}

.support-hub {
    padding: 4rem 0;
    background: var(--background-secondary);
}

.support-hub h2 {
    text-align: center;
    margin-bottom: 3rem;
    color: var(--primary-color);
}

.support-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
}

.support-card {
    background: var(--background-primary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 2rem;
    text-align: center;
    transition: all 0.3s ease;
}

.support-card:hover {
    border-color: var(--primary-color);
    box-shadow: 0 4px 15px var(--shadow-color);
}

.support-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
}

.support-card h3 {
    color: var(--primary-color);
    margin-bottom: 1rem;
}

.support-card p {
    color: var(--text-secondary);
    margin-bottom: 1.5rem;
    line-height: 1.6;
}

.support-link {
    color: var(--accent-color);
    text-decoration: none;
    font-weight: 600;
    transition: color 0.3s ease;
    cursor: pointer;
}

.support-link:hover {
    color: var(--primary-color);
}

.partnerships-section {
    padding: 4rem 0;
    background: var(--background-primary);
}

.partnerships-section h2 {
    text-align: center;
    margin-bottom: 3rem;
    color: var(--primary-color);
}

.partnerships-content {
    max-width: 1000px;
    margin: 0 auto;
}

.partnership-intro {
    text-align: center;
    margin-bottom: 3rem;
}

.partnership-intro h3 {
    color: var(--primary-color);
    margin-bottom: 1rem;
}

.partnership-intro p {
    color: var(--text-secondary);
    font-size: 1.1rem;
    line-height: 1.6;
}

.partnership-types {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
    margin-bottom: 3rem;
}

.partnership-type {
    background: var(--background-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 2rem;
    transition: all 0.3s ease;
}

.partnership-type:hover {
    border-color: var(--primary-color);
    box-shadow: 0 4px 15px var(--shadow-color);
}

.partnership-type h4 {
    color: var(--primary-color);
    margin-bottom: 1rem;
}

.partnership-type p {
    color: var(--text-secondary);
    margin-bottom: 1rem;
    line-height: 1.6;
}

.partnership-type ul {
    color: var(--text-secondary);
    padding-left: 1.5rem;
}

.partnership-type li {
    margin-bottom: 0.5rem;
}

.partnership-cta {
    text-align: center;
    background: var(--background-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 2rem;
}

.partnership-cta h3 {
    color: var(--primary-color);
    margin-bottom: 1rem;
}

.partnership-cta p {
    color: var(--text-secondary);
    margin-bottom: 1.5rem;
}

.contact-form-section {
    padding: 4rem 0;
    background: var(--background-secondary);
}

.contact-form-section h2 {
    text-align: center;
    margin-bottom: 3rem;
    color: var(--primary-color);
}

.contact-form-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4rem;
    max-width: 1200px;
    margin: 0 auto;
}

.contact-info h3 {
    color: var(--primary-color);
    margin-bottom: 1rem;
}

.contact-info p {
    color: var(--text-secondary);
    margin-bottom: 2rem;
    font-size: 1.1rem;
}

.contact-methods {
    margin-bottom: 2rem;
}

.contact-method {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1.5rem;
}

.method-icon {
    font-size: 1.5rem;
    color: var(--primary-color);
}

.contact-form {
    background: var(--background-primary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 2rem;
}

.form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;
}

.form-group {
    margin-bottom: 1.5rem;
}

.form-group label {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--text-primary);
    font-weight: 600;
}

.form-group input,
.form-group select,
.form-group textarea {
    width: 100%;
    padding: 1rem;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--background-secondary);
    color: var(--text-primary);
    font-size: 1rem;
    transition: border-color 0.3s ease;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
    outline: none;
    border-color: var(--primary-color);
}

.form-group textarea {
    resize: vertical;
    min-height: 120px;
}

.form-options {
    margin-bottom: 1.5rem;
}

.checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: normal;
    color: var(--text-secondary);
}

.checkbox-label input[type="checkbox"] {
    width: auto;
    margin: 0;
}

.form-message {
    margin-top: 1rem;
    padding: 1rem;
    border-radius: 8px;
    font-weight: 500;
    display: none;
}

.form-message.success {
    background: rgba(16, 185, 129, 0.1);
    color: var(--success-color);
    border: 1px solid var(--success-color);
}

.form-message.error {
    background: rgba(239, 68, 68, 0.1);
    color: var(--error-color);
    border: 1px solid var(--error-color);
}

.form-message.info {
    background: rgba(59, 130, 246, 0.1);
    color: var(--primary-color);
    border: 1px solid var(--primary-color);
}

@media (max-width: 768px) {
    .connect-header h1 {
        font-size: 2rem;
    }

    .connection-grid {
        grid-template-columns: 1fr;
    }

    .quick-start-steps {
        grid-template-columns: 1fr;
    }

    .step-arrow {
        display: block;
        text-align: center;
        margin: 1rem 0;
        font-size: 2rem;
        color: var(--primary-color);
    }

    .credentials-form {
        grid-template-columns: 1fr;
    }

    .showcase-tabs {
        flex-direction: column;
        align-items: center;
    }

    .support-grid {
        grid-template-columns: 1fr;
    }

    .partnership-types {
        grid-template-columns: 1fr;
    }

    .contact-form-container {
        grid-template-columns: 1fr;
        gap: 2rem;
    }

    .form-row {
        grid-template-columns: 1fr;
    }
}
`;
document.head.appendChild(connectStyles);

// Initialize connect page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.connectPage = new ConnectPage();

    // Make function globally available
    window.startSupportChat = startSupportChat;
});