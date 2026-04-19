// THE BRIDGE AI OS - Contact JavaScript
// Contact form handling and live chat functionality

class Contact {
    constructor() {
        this.chatMessages = [];
        this.chatVisible = false;
        this.typing = false;

        this.init();
    }

    init() {
        this.setupContactForm();
        this.setupLiveChat();
        this.setupLiveSync();
        this.loadContactData();
    }

    setupContactForm() {
        const form = document.getElementById('contact-form');
        const messageElement = document.getElementById('form-message');

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                const formData = new FormData(form);
                const data = Object.fromEntries(formData.entries());

                // Validate form
                if (!this.validateForm(data)) {
                    return;
                }

                // Show loading state
                this.showFormMessage('Sending message...', 'info');
                form.querySelector('button[type="submit"]').disabled = true;

                try {
                    const response = await fetch('/api/contact', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });

                    if (response.ok) {
                        this.showFormMessage('Message sent successfully! We\'ll get back to you within 24 hours.', 'success');
                        form.reset();
                    } else {
                        throw new Error('Failed to send message');
                    }
                } catch (error) {
                    console.error('Contact form error:', error);
                    this.showFormMessage('Failed to send message. Please try again or contact us directly.', 'error');
                } finally {
                    form.querySelector('button[type="submit"]').disabled = false;
                }
            });
        }
    }

    validateForm(data) {
        const requiredFields = ['name', 'email', 'subject', 'message'];

        for (const field of requiredFields) {
            if (!data[field] || !data[field].trim()) {
                this.showFormMessage(`Please fill in the ${field} field.`, 'error');
                return false;
            }
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
            this.showFormMessage('Please enter a valid email address.', 'error');
            return false;
        }

        return true;
    }

    showFormMessage(message, type) {
        const messageElement = document.getElementById('form-message');
        if (messageElement) {
            messageElement.textContent = message;
            messageElement.className = `form-message ${type}`;
            messageElement.style.display = 'block';

            // Auto-hide success messages
            if (type === 'success') {
                setTimeout(() => {
                    messageElement.style.display = 'none';
                }, 5000);
            }
        }
    }

    setupLiveChat() {
        const chatWidget = document.getElementById('live-chat-widget');
        const chatWindow = document.getElementById('chat-window');
        const chatInput = document.getElementById('chat-input-field');

        // Make chat widget visible after page load
        setTimeout(() => {
            if (chatWidget) {
                chatWidget.style.display = 'block';
            }
        }, 2000);

        // Chat input handling
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendChatMessage();
                }
            });
        }
    }

    toggleLiveChat() {
        const chatWindow = document.getElementById('chat-window');
        const chatIcon = document.getElementById('chat-icon');

        this.chatVisible = !this.chatVisible;

        if (this.chatVisible) {
            chatWindow.style.display = 'block';
            chatIcon.textContent = '✕';
            document.getElementById('chat-input-field').focus();
        } else {
            chatWindow.style.display = 'none';
            chatIcon.textContent = '💬';
        }
    }

    sendChatMessage() {
        const inputField = document.getElementById('chat-input-field');
        const message = inputField.value.trim();

        if (!message) return;

        // Add user message
        this.addChatMessage({
            type: 'user',
            content: message,
            timestamp: Date.now()
        });

        // Clear input
        inputField.value = '';

        // Send via live sync
        if (window.liveSync) {
            window.liveSync.sendMessage('chat_message', {
                content: message,
                timestamp: Date.now()
            });
        }

        // Simulate typing indicator
        this.showTypingIndicator();

        // Simulate response (replace with actual AI integration)
        setTimeout(() => {
            this.hideTypingIndicator();
            this.addChatMessage({
                type: 'bot',
                content: this.generateBotResponse(message),
                timestamp: Date.now()
            });
        }, 1000 + Math.random() * 2000);
    }

    generateBotResponse(userMessage) {
        const responses = [
            "Thanks for your message! Our team will get back to you shortly.",
            "I understand you're looking for help with THE BRIDGE AI OS. Let me connect you with our technical team.",
            "That's a great question about our AI system. Our documentation has detailed information about this topic.",
            "I'd be happy to help you with that. Could you provide a bit more detail about what you're trying to accomplish?",
            "Our AI system is designed to handle complex tasks efficiently. Is there a specific feature you'd like to learn more about?",
            "Thank you for your interest in THE BRIDGE AI OS. Would you like me to schedule a demo for you?"
        ];

        // Simple keyword-based responses
        const lowerMessage = userMessage.toLowerCase();

        if (lowerMessage.includes('pricing') || lowerMessage.includes('cost')) {
            return "We offer flexible pricing plans starting from $99/month. Would you like me to send you our pricing guide?";
        }

        if (lowerMessage.includes('demo') || lowerMessage.includes('trial')) {
            return "We'd love to show you THE BRIDGE AI OS in action! Our demos are typically 30 minutes. When would work best for you?";
        }

        if (lowerMessage.includes('support') || lowerMessage.includes('help')) {
            return "Our support team is here to help! You can reach us at support@thebridgeaios.com or check our documentation at docs.thebridgeaios.com";
        }

        // Random response
        return responses[Math.floor(Math.random() * responses.length)];
    }

    addChatMessage(message) {
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;

        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${message.type}`;

        const timeString = new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

        messageElement.innerHTML = `
            <div class="message-content">${message.content}</div>
            <div class="message-time">${timeString}</div>
        `;

        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Store message
        this.chatMessages.push(message);

        // Keep only last 50 messages
        if (this.chatMessages.length > 50) {
            this.chatMessages.shift();
            if (messagesContainer.children.length > 50) {
                messagesContainer.removeChild(messagesContainer.firstChild);
            }
        }
    }

    showTypingIndicator() {
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer || this.typing) return;

        this.typing = true;
        const typingElement = document.createElement('div');
        typingElement.className = 'chat-message bot typing';
        typingElement.id = 'typing-indicator';
        typingElement.innerHTML = `
            <div class="message-content">
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;

        messagesContainer.appendChild(typingElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    hideTypingIndicator() {
        const typingElement = document.getElementById('typing-indicator');
        if (typingElement) {
            typingElement.remove();
        }
        this.typing = false;
    }

    setupLiveSync() {
        // Extend the global liveSync instance
        if (window.liveSync) {
            window.liveSync.addChatMessage = (message) => this.addChatMessage(message);
        }
    }

    async loadContactData() {
        try {
            const response = await fetch('/api/contact/info');
            if (response.ok) {
                const data = await response.json();
                this.updateContactInfo(data);
            }
        } catch (error) {
            console.error('Failed to load contact data:', error);
        }
    }

    updateContactInfo(data) {
        // Update contact details if needed
        if (data.responseTime) {
            const responseTimeElement = document.querySelector('.response-time p');
            if (responseTimeElement) {
                responseTimeElement.textContent = data.responseTime;
            }
        }
    }
}

// Live chat functions for global access
function startLiveChat() {
    if (window.contact) {
        window.contact.toggleLiveChat();
    }
}

function toggleLiveChat() {
    if (window.contact) {
        window.contact.toggleLiveChat();
    }
}

function handleChatKeyPress(event) {
    // Handled by the Contact class
}

function sendChatMessage() {
    if (window.contact) {
        window.contact.sendChatMessage();
    }
}

// Add contact-specific styles
const contactStyles = document.createElement('style');
contactStyles.textContent = `
.form-message {
    margin-top: 1rem;
    padding: 1rem;
    border-radius: 8px;
    display: none;
    font-weight: 500;
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

.checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: normal;
}

.checkbox-label input[type="checkbox"] {
    width: auto;
    margin: 0;
}

/* Live Chat Styles */
.live-chat-widget {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 1000;
    display: none;
}

.chat-toggle {
    width: 60px;
    height: 60px;
    background: linear-gradient(135deg, var(--primary-color), var(--accent-color));
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 15px var(--glow-color);
    transition: all 0.3s ease;
    font-size: 1.5rem;
}

.chat-toggle:hover {
    transform: scale(1.1);
    box-shadow: 0 8px 25px var(--glow-color);
}

.chat-window {
    position: absolute;
    bottom: 80px;
    right: 0;
    width: 350px;
    height: 500px;
    background: var(--background-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    box-shadow: 0 10px 30px var(--shadow-color);
    display: none;
    flex-direction: column;
    overflow: hidden;
}

.chat-header {
    background: var(--background-tertiary);
    padding: 1rem;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.chat-header h4 {
    margin: 0;
    color: var(--primary-color);
    font-size: 1rem;
}

.chat-close {
    cursor: pointer;
    font-size: 1.2rem;
    color: var(--text-secondary);
    padding: 0.25rem;
}

.chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.chat-message {
    max-width: 80%;
    animation: messageSlideIn 0.3s ease;
}

.chat-message.user {
    align-self: flex-end;
}

.chat-message.bot {
    align-self: flex-start;
}

.message-content {
    padding: 0.75rem 1rem;
    border-radius: 18px;
    word-wrap: break-word;
    line-height: 1.4;
}

.chat-message.user .message-content {
    background: var(--primary-color);
    color: white;
}

.chat-message.bot .message-content {
    background: var(--background-tertiary);
    color: var(--text-primary);
}

.message-time {
    font-size: 0.7rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
    padding: 0 1rem;
}

.chat-input {
    border-top: 1px solid var(--border-color);
    padding: 1rem;
    display: flex;
    gap: 0.5rem;
}

#chat-input-field {
    flex: 1;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border-color);
    border-radius: 20px;
    background: var(--background-primary);
    color: var(--text-primary);
    font-family: inherit;
    resize: none;
}

#chat-input-field:focus {
    outline: none;
    border-color: var(--primary-color);
}

.chat-send-btn {
    padding: 0.75rem 1rem;
    background: var(--primary-color);
    color: white;
    border: none;
    border-radius: 20px;
    cursor: pointer;
    font-weight: 600;
    transition: background 0.3s ease;
}

.chat-send-btn:hover {
    background: var(--secondary-color);
}

.typing-dots {
    display: flex;
    gap: 4px;
    padding: 0.5rem 0;
}

.typing-dots span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-muted);
    animation: typing 1.4s infinite;
}

.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.typing-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes messageSlideIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes typing {
    0%, 60%, 100% {
        transform: translateY(0);
        opacity: 0.4;
    }
    30% {
        transform: translateY(-10px);
        opacity: 1;
    }
}

/* FAQ Styles */
.faq-item {
    background: var(--background-secondary);
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1rem;
    border: 1px solid var(--border-color);
    transition: all 0.3s ease;
}

.faq-item:hover {
    border-color: var(--primary-color);
    box-shadow: 0 4px 15px var(--shadow-color);
}

.faq-item h4 {
    color: var(--primary-color);
    margin-bottom: 0.75rem;
    font-size: 1.1rem;
}

.faq-item p {
    color: var(--text-secondary);
    line-height: 1.6;
    margin: 0;
}

@media (max-width: 768px) {
    .contact-form-container {
        flex-direction: column;
    }

    .chat-window {
        width: calc(100vw - 40px);
        height: 400px;
        right: -10px;
    }

    .faq-grid {
        grid-template-columns: 1fr;
    }
}
`;
document.head.appendChild(contactStyles);

// Initialize contact when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.contact = new Contact();

    // Make functions globally available
    window.startLiveChat = startLiveChat;
    window.toggleLiveChat = toggleLiveChat;
    window.handleChatKeyPress = () => {}; // Handled by event listener
    window.sendChatMessage = sendChatMessage;
});