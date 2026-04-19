// THE BRIDGE AI OS - Live Sync System
// Real-time synchronization between all pages and server

class LiveSync {
    constructor() {
        this.ws = null;
        this.eventSource = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.heartbeatInterval = null;
        this.pageType = this.detectPageType();
        this.syncStatus = document.getElementById('sync-status');
        this.syncIndicator = document.getElementById('sync-indicator');
        this.syncText = document.getElementById('sync-text');

        this.init();
    }

    detectPageType() {
        const path = window.location.pathname;
        if (path.includes('dashboard')) return 'dashboard';
        if (path.includes('docs')) return 'docs';
        if (path.includes('blog')) return 'blog';
        if (path.includes('contact')) return 'contact';
        return 'home';
    }

    init() {
        this.updateSyncStatus('connecting', '🔄 Connecting...');

        // Try WebSocket first, fallback to Server-Sent Events
        this.connectWebSocket();

        // Set up heartbeat
        this.startHeartbeat();

        // Listen for page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseSync();
            } else {
                this.resumeSync();
            }
        });

        // Handle online/offline events
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
    }

    connectWebSocket() {
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws`;

            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('🌉 Live sync connected via WebSocket');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.updateSyncStatus('connected', '✅ Synced');
                this.sendPageInfo();
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };

            this.ws.onclose = () => {
                console.log('🌉 WebSocket connection closed');
                this.isConnected = false;
                this.updateSyncStatus('disconnected', '❌ Disconnected');
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('🌉 WebSocket error:', error);
                this.fallbackToSSE();
            };

        } catch (error) {
            console.error('🌉 WebSocket connection failed:', error);
            this.fallbackToSSE();
        }
    }

    fallbackToSSE() {
        console.log('🌉 Falling back to Server-Sent Events');
        this.connectSSE();
    }

    connectSSE() {
        try {
            const sseUrl = `/api/events?page=${this.pageType}`;
            this.eventSource = new EventSource(sseUrl);

            this.eventSource.onopen = () => {
                console.log('🌉 Live sync connected via SSE');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.updateSyncStatus('connected', '✅ Synced (SSE)');
            };

            this.eventSource.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };

            this.eventSource.onerror = () => {
                console.error('🌉 SSE connection error');
                this.isConnected = false;
                this.updateSyncStatus('disconnected', '❌ Disconnected');
                this.attemptReconnect();
            };

        } catch (error) {
            console.error('🌉 SSE connection failed:', error);
            this.updateSyncStatus('error', '❌ Sync Error');
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('🌉 Max reconnection attempts reached');
            this.updateSyncStatus('error', '❌ Sync Failed');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        console.log(`🌉 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

        setTimeout(() => {
            if (this.ws) {
                this.connectWebSocket();
            } else {
                this.connectSSE();
            }
        }, delay);
    }

    handleMessage(data) {
        console.log('🌉 Received sync message:', data);

        switch (data.type) {
            case 'system_status':
                this.handleSystemStatus(data.payload);
                break;
            case 'economic_data':
                this.handleEconomicData(data.payload);
                break;
            case 'intelligence_update':
                this.handleIntelligenceUpdate(data.payload);
                break;
            case 'activity_feed':
                this.handleActivityFeed(data.payload);
                break;
            case 'blog_update':
                this.handleBlogUpdate(data.payload);
                break;
            case 'chat_message':
                this.handleChatMessage(data.payload);
                break;
            case 'heartbeat':
                this.handleHeartbeat();
                break;
            default:
                console.log('🌉 Unknown message type:', data.type);
        }
    }

    handleSystemStatus(status) {
        // Update system status across pages
        if (this.pageType === 'dashboard' || this.pageType === 'home') {
            this.updateSystemStatus(status);
        }
    }

    handleEconomicData(data) {
        if (this.pageType === 'dashboard') {
            this.updateEconomicMetrics(data);
        }
    }

    handleIntelligenceUpdate(data) {
        if (this.pageType === 'dashboard') {
            this.updateIntelligenceMetrics(data);
        }
    }

    handleActivityFeed(activities) {
        if (this.pageType === 'dashboard') {
            this.updateActivityFeed(activities);
        }
    }

    handleBlogUpdate(posts) {
        if (this.pageType === 'blog') {
            this.updateBlogPosts(posts);
        }
    }

    handleChatMessage(message) {
        if (this.pageType === 'contact') {
            this.addChatMessage(message);
        }
    }

    handleHeartbeat() {
        // Update last sync time
        const now = new Date();
        this.updateSyncStatus('connected', `✅ Synced ${now.toLocaleTimeString()}`);
    }

    sendPageInfo() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'page_info',
                payload: {
                    page: this.pageType,
                    url: window.location.href,
                    timestamp: Date.now()
                }
            }));
        }
    }

    sendMessage(type, payload) {
        const message = {
            type,
            payload,
            timestamp: Date.now(),
            page: this.pageType
        };

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            // Fallback: send via HTTP
            fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(message)
            });
        }
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected) {
                this.sendMessage('heartbeat', { timestamp: Date.now() });
            }
        }, 30000); // 30 seconds
    }

    pauseSync() {
        console.log('🌉 Sync paused (page hidden)');
        this.updateSyncStatus('paused', '⏸️ Paused');
    }

    resumeSync() {
        console.log('🌉 Sync resumed (page visible)');
        this.updateSyncStatus('connecting', '🔄 Reconnecting...');
        if (!this.isConnected) {
            this.attemptReconnect();
        }
    }

    handleOnline() {
        console.log('🌉 Network online');
        this.updateSyncStatus('connecting', '🔄 Reconnecting...');
        this.attemptReconnect();
    }

    handleOffline() {
        console.log('🌉 Network offline');
        this.updateSyncStatus('offline', '📶 Offline');
        this.isConnected = false;
    }

    updateSyncStatus(status, text) {
        if (this.syncStatus && this.syncIndicator && this.syncText) {
            this.syncStatus.className = `sync-status status-${status}`;
            this.syncText.textContent = text;

            // Update indicator based on status
            switch (status) {
                case 'connected':
                    this.syncIndicator.textContent = '✅';
                    break;
                case 'connecting':
                    this.syncIndicator.textContent = '🔄';
                    break;
                case 'disconnected':
                    this.syncIndicator.textContent = '❌';
                    break;
                case 'error':
                    this.syncIndicator.textContent = '❌';
                    break;
                case 'paused':
                    this.syncIndicator.textContent = '⏸️';
                    break;
                case 'offline':
                    this.syncIndicator.textContent = '📶';
                    break;
            }
        }
    }

    // Page-specific update methods (to be overridden by page scripts)
    updateSystemStatus(status) {
        // Override in page-specific scripts
    }

    updateEconomicMetrics(data) {
        // Override in dashboard.js
    }

    updateIntelligenceMetrics(data) {
        // Override in dashboard.js
    }

    updateActivityFeed(activities) {
        // Override in dashboard.js
    }

    updateBlogPosts(posts) {
        // Override in blog.js
    }

    addChatMessage(message) {
        // Override in contact.js
    }

    destroy() {
        if (this.ws) {
            this.ws.close();
        }
        if (this.eventSource) {
            this.eventSource.close();
        }
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
    }
}

// Initialize live sync when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.liveSync = new LiveSync();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.liveSync) {
        window.liveSync.destroy();
    }
});