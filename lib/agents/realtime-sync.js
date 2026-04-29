'use strict';

/**
 * REAL-TIME SYNC LAYER
 * ====================
 * WebSocket server for live agent earnings
 */

const WebSocket = require('ws');
const EventEmitter = require('events');

class RealtimeSync extends EventEmitter {
  constructor(server) {
    super();
    this.wss = null;
    this.clients = new Map(); // clientId -> websocket
    
    if (server) {
      this.init(server);
    }
  }

  init(server) {
    this.wss = new WebSocket.Server({ server, path: '/ws/realtime' });
    
    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      this.clients.set(clientId, ws);
      
      console.log(`[WS] Client connected: ${clientId}`);
      
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          this.handleMessage(clientId, msg);
        } catch (e) {
          console.error('[WS] Parse error:', e.message);
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`[WS] Client disconnected: ${clientId}`);
      });

      // Send initial state
      this.send(clientId, { type: 'connected', clientId });
    });

    // Broadcast to all clients
    this.broadcast = (type, payload) => {
      const msg = JSON.stringify({ type, payload, timestamp: Date.now() });
      for (const [, ws] of this.clients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(msg);
        }
      }
    };
  }

  handleMessage(clientId, msg) {
    switch (msg.type) {
      case 'subscribe':
        this.emit('subscribe', { clientId, channel: msg.channel });
        break;
      case 'ping':
        this.send(clientId, { type: 'pong' });
        break;
    }
  }

  send(clientId, payload) {
    const ws = this.clients.get(clientId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  // Broadcast agent earnings
  broadcastEarnings(agentId, amount, source) {
    this.broadcast('agent.earnings', { agentId, amount, source, timestamp: Date.now() });
  }

  // Broadcast revenue event
  broadcastRevenue(userId, amount, source) {
    this.broadcast('revenue.event', { userId, amount, source, timestamp: Date.now() });
  }

  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getClientCount() {
    return this.clients.size;
  }
}

module.exports = RealtimeSync;