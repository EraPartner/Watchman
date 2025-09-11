import { WebSocketServer } from 'ws';
import EventEmitter from 'events';

export class WebSocketManager extends EventEmitter {
  constructor() {
    super();
    this.wss = null;
    this.clients = new Set();
    this.isEnabled = process.env.ENABLE_WEBSOCKETS !== 'false';
  }

  initialize(server) {
    if (!this.isEnabled) {
      console.log('📡 WebSocket disabled via environment variable');
      return;
    }

    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
      clientTracking: true
    });

    this.wss.on('connection', (ws, req) => {
      console.log(`📡 WebSocket client connected from ${req.socket.remoteAddress}`);
      this.clients.add(ws);

      // Send initial connection message
      ws.send(JSON.stringify({
        type: 'connection',
        message: 'Connected to Watchman WebSocket server',
        timestamp: new Date().toISOString()
      }));

      // Handle client disconnect
      ws.on('close', () => {
        console.log('📡 WebSocket client disconnected');
        this.clients.delete(ws);
      });

      // Handle client errors
      ws.on('error', (error) => {
        console.error('📡 WebSocket client error:', error);
        this.clients.delete(ws);
      });

      // Handle ping/pong for connection keepalive
      ws.on('pong', () => {
        ws.isAlive = true;
      });
    });

    // Heartbeat to detect broken connections
    const interval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          console.log('📡 Terminating dead WebSocket connection');
          return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // 30 seconds

    this.wss.on('close', () => {
      clearInterval(interval);
    });

    console.log('📡 WebSocket server initialized on /ws');
  }

  // Broadcast service health updates
  broadcastServiceUpdate(serviceName, data) {
    if (!this.isEnabled || !this.wss) return;

    const message = JSON.stringify({
      type: 'service_update',
      service: serviceName,
      data,
      timestamp: new Date().toISOString()
    });

    let sentCount = 0;
    this.clients.forEach((ws) => {
      if (ws.readyState === ws.OPEN) {
        try {
          ws.send(message);
          sentCount++;
        } catch (error) {
          console.error('📡 Error sending WebSocket message:', error);
          this.clients.delete(ws);
        }
      }
    });

    if (sentCount > 0) {
      console.log(`📡 Broadcasted ${serviceName} update to ${sentCount} clients`);
    }
  }

  // Broadcast system alerts
  broadcastAlert(level, message, service = null) {
    if (!this.isEnabled || !this.wss) return;

    const alert = JSON.stringify({
      type: 'alert',
      level, // 'info', 'warning', 'error'
      message,
      service,
      timestamp: new Date().toISOString()
    });

    this.clients.forEach((ws) => {
      if (ws.readyState === ws.OPEN) {
        try {
          ws.send(alert);
        } catch (error) {
          console.error('📡 Error sending alert:', error);
          this.clients.delete(ws);
        }
      }
    });

    console.log(`📡 Broadcasted ${level} alert: ${message}`);
  }

  // Get connection statistics
  getStats() {
    if (!this.isEnabled || !this.wss) {
      return { enabled: false, clients: 0 };
    }

    return {
      enabled: true,
      clients: this.clients.size,
      totalClients: this.wss.clients.size
    };
  }

  shutdown() {
    if (this.wss) {
      console.log('📡 Shutting down WebSocket server...');
      this.wss.close();
      this.clients.clear();
    }
  }
}

export default new WebSocketManager();