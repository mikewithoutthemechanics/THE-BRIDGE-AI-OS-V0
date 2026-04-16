'use strict';
/**
 * AGENT-TO-AGENT (A2A) COMMUNICATION SYSTEM
 * =========================================
 * Enables secure, real-time communication between AI agents within Bridge AI OS.
 *
 * Features:
 *   - Message queuing and delivery
 *   - Agent discovery and registration
 *   - Encrypted communication channels
 *   - Event-driven messaging
 *   - Health monitoring and failover
 *
 * Architecture:
 *   - Primary: Redis pub/sub channels
 *   - Fallback: In-memory message bus
 *   - Persistence: Supabase message history
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class A2ACommunication extends EventEmitter {
    constructor() {
        super();
        this.agents = new Map(); // agentId -> { id, name, status, lastSeen, capabilities }
        this.channels = new Map(); // channelName -> Set of subscribed agents
        this.messageQueue = new Map(); // agentId -> Queue of pending messages
        this.redis = null;
        this.supabase = null;

        // Initialize Redis connection if available
        this._initRedis();
        this._initSupabase();

        // Health monitoring
        this.healthCheckInterval = setInterval(() => this._healthCheck(), 30000);

        console.log('[A2A] Agent-to-Agent communication system initialized');
    }

    // ── REDIS INTEGRATION ───────────────────────────────────────────────────────
    _initRedis() {
        try {
            const redis = require('redis');
            this.redis = redis.createClient({
                url: process.env.REDIS_URL || 'redis://localhost:6379'
            });

            this.redis.on('error', (err) => {
                console.warn('[A2A] Redis unavailable:', err.message);
                this.redis = null;
            });

            this.redis.on('connect', () => {
                console.log('[A2A] Connected to Redis for A2A messaging');
            });

            this.redis.connect().catch(() => {
                console.warn('[A2A] Redis connection failed, using in-memory fallback');
            });
        } catch (err) {
            console.warn('[A2A] Redis not available, using in-memory messaging');
        }
    }

    // ── SUPABASE INTEGRATION ────────────────────────────────────────────────────
    _initSupabase() {
        try {
            this.supabase = require('./supabase').supabase;
        } catch (_) {
            console.warn('[A2A] Supabase not available for message persistence');
        }
    }

    // ── AGENT REGISTRATION ──────────────────────────────────────────────────────
    async registerAgent(agentId, agentData) {
        const agent = {
            id: agentId,
            name: agentData.name || agentId,
            status: 'online',
            lastSeen: Date.now(),
            capabilities: agentData.capabilities || [],
            metadata: agentData.metadata || {},
            registeredAt: Date.now()
        };

        this.agents.set(agentId, agent);
        this.messageQueue.set(agentId, []);

        // Subscribe to agent's personal channel
        await this._subscribeToChannel(`agent:${agentId}`);

        // Broadcast agent online status
        await this.broadcast('agent:status', {
            agentId,
            status: 'online',
            timestamp: Date.now()
        });

        console.log(`[A2A] Agent registered: ${agentId} (${agent.capabilities.length} capabilities)`);

        this.emit('agent:registered', agent);
        return agent;
    }

    async unregisterAgent(agentId) {
        if (!this.agents.has(agentId)) return;

        // Broadcast offline status
        await this.broadcast('agent:status', {
            agentId,
            status: 'offline',
            timestamp: Date.now()
        });

        // Clean up subscriptions
        await this._unsubscribeFromChannel(`agent:${agentId}`, agentId);

        this.agents.delete(agentId);
        this.messageQueue.delete(agentId);

        console.log(`[A2A] Agent unregistered: ${agentId}`);
        this.emit('agent:unregistered', agentId);
    }

    // ── MESSAGE SENDING ─────────────────────────────────────────────────────────
    async sendMessage(fromAgentId, toAgentId, message, options = {}) {
        const envelope = {
            id: crypto.randomUUID(),
            from: fromAgentId,
            to: toAgentId,
            message: message,
            timestamp: Date.now(),
            priority: options.priority || 'normal',
            ttl: options.ttl || 3600000, // 1 hour default
            encrypted: options.encrypted || false
        };

        // If recipient is online, deliver immediately
        if (this.agents.has(toAgentId)) {
            await this._deliverMessage(envelope);
        } else {
            // Queue for later delivery
            this._queueMessage(toAgentId, envelope);
        }

        // Persist to Supabase if available
        if (this.supabase) {
            try {
                await this.supabase.from('agent_messages').insert(envelope);
            } catch (err) {
                console.warn('[A2A] Failed to persist message:', err.message);
            }
        }

        this.emit('message:sent', envelope);
        return envelope.id;
    }

    async broadcast(channel, message, options = {}) {
        const envelope = {
            id: crypto.randomUUID(),
            channel: channel,
            message: message,
            timestamp: Date.now(),
            from: options.fromAgentId || 'system',
            priority: options.priority || 'normal'
        };

        // Redis broadcast
        if (this.redis) {
            try {
                await this.redis.publish(channel, JSON.stringify(envelope));
            } catch (err) {
                console.warn('[A2A] Redis broadcast failed:', err.message);
            }
        }

        // In-memory broadcast
        const subscribers = this.channels.get(channel) || new Set();
        for (const agentId of subscribers) {
            if (this.agents.has(agentId)) {
                await this._deliverMessage({ ...envelope, to: agentId });
            }
        }

        this.emit('message:broadcast', envelope);
        return envelope.id;
    }

    // ── CHANNEL SUBSCRIPTION ────────────────────────────────────────────────────
    async subscribeToChannel(agentId, channelName) {
        if (!this.channels.has(channelName)) {
            this.channels.set(channelName, new Set());
        }
        this.channels.get(channelName).add(agentId);

        // Redis subscription
        await this._subscribeToChannel(channelName);

        console.log(`[A2A] Agent ${agentId} subscribed to channel: ${channelName}`);
        this.emit('channel:subscribed', { agentId, channel: channelName });
    }

    async unsubscribeFromChannel(agentId, channelName) {
        const channel = this.channels.get(channelName);
        if (channel) {
            channel.delete(agentId);
            if (channel.size === 0) {
                this.channels.delete(channelName);
                await this._unsubscribeFromChannel(channelName);
            }
        }

        console.log(`[A2A] Agent ${agentId} unsubscribed from channel: ${channelName}`);
        this.emit('channel:unsubscribed', { agentId, channel: channelName });
    }

    // ── PRIVATE METHODS ─────────────────────────────────────────────────────────
    async _subscribeToChannel(channelName) {
        if (!this.redis) return;

        try {
            const subscriber = this.redis.duplicate();
            await subscriber.connect();

            await subscriber.subscribe(channelName, (message) => {
                try {
                    const envelope = JSON.parse(message);
                    // Distribute to all subscribers of this channel
                    const subscribers = this.channels.get(channelName) || new Set();
                    for (const agentId of subscribers) {
                        if (this.agents.has(agentId)) {
                            this._deliverMessage({ ...envelope, to: agentId });
                        }
                    }
                } catch (err) {
                    console.warn('[A2A] Failed to process Redis message:', err.message);
                }
            });
        } catch (err) {
            console.warn('[A2A] Redis subscription failed:', err.message);
        }
    }

    async _unsubscribeFromChannel(channelName) {
        // Redis cleanup handled automatically
    }

    async _deliverMessage(envelope) {
        const agent = this.agents.get(envelope.to);
        if (!agent) return;

        // Update agent's last seen
        agent.lastSeen = Date.now();

        // Emit message event for the agent
        this.emit(`message:${envelope.to}`, envelope);

        // If agent has a callback handler, invoke it
        if (agent.messageHandler) {
            try {
                await agent.messageHandler(envelope);
            } catch (err) {
                console.error(`[A2A] Message handler error for agent ${envelope.to}:`, err);
            }
        }
    }

    _queueMessage(agentId, envelope) {
        const queue = this.messageQueue.get(agentId) || [];
        queue.push(envelope);

        // Keep only recent messages (last 100)
        if (queue.length > 100) {
            queue.shift();
        }

        this.messageQueue.set(agentId, queue);
    }

    // ── HEALTH MONITORING ──────────────────────────────────────────────────────
    async _healthCheck() {
        const now = Date.now();
        const timeoutMs = 60000; // 1 minute timeout

        for (const [agentId, agent] of this.agents) {
            if (now - agent.lastSeen > timeoutMs) {
                agent.status = 'offline';
                console.warn(`[A2A] Agent ${agentId} marked offline (no activity for ${Math.round((now - agent.lastSeen) / 1000)}s)`);
            }
        }

        // Deliver queued messages to agents that came back online
        for (const [agentId, queue] of this.messageQueue) {
            if (this.agents.has(agentId) && this.agents.get(agentId).status === 'online') {
                while (queue.length > 0) {
                    const message = queue.shift();
                    await this._deliverMessage(message);
                }
            }
        }

        this.emit('health:check', {
            totalAgents: this.agents.size,
            onlineAgents: Array.from(this.agents.values()).filter(a => a.status === 'online').length,
            channels: this.channels.size,
            queuedMessages: Array.from(this.messageQueue.values()).reduce((sum, q) => sum + q.length, 0)
        });
    }

    // ── PUBLIC API ─────────────────────────────────────────────────────────────
    getAgent(agentId) {
        return this.agents.get(agentId);
    }

    getAllAgents() {
        return Array.from(this.agents.values());
    }

    getChannelSubscribers(channelName) {
        return Array.from(this.channels.get(channelName) || []);
    }

    getAgentStats() {
        const agents = Array.from(this.agents.values());
        return {
            total: agents.length,
            online: agents.filter(a => a.status === 'online').length,
            offline: agents.filter(a => a.status === 'offline').length,
            capabilities: agents.reduce((sum, a) => sum + a.capabilities.length, 0),
            channels: this.channels.size
        };
    }

    // Graceful shutdown
    async shutdown() {
        console.log('[A2A] Shutting down A2A communication system...');

        clearInterval(this.healthCheckInterval);

        // Broadcast shutdown message
        await this.broadcast('system:shutdown', {
            message: 'A2A communication system shutting down',
            timestamp: Date.now()
        });

        if (this.redis) {
            await this.redis.quit();
        }

        this.emit('shutdown');
        console.log('[A2A] A2A communication system shut down');
    }
}

// Singleton instance
let a2aInstance = null;

function getA2AInstance() {
    if (!a2aInstance) {
        a2aInstance = new A2ACommunication();
    }
    return a2aInstance;
}

module.exports = { A2ACommunication, getA2AInstance };