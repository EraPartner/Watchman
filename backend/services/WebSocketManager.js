import { WebSocketServer } from 'ws';
import EventEmitter from 'events';
import { verifyToken } from '../middleware/auth.js';

export class WebSocketManager extends EventEmitter {
  constructor() {
    super();
    this.wss = null;
    this.clients = new Set();
    this.isEnabled = process.env.ENABLE_WEBSOCKETS !== 'false';
    this._heartbeatInterval = null;
  }

  initialize(server) {
    if (!this.isEnabled) {
      console.log('📡 WebSocket disabled via environment variable');
      return;
    }

    if (this.wss) {
      console.warn('📡 WebSocket server already initialized; skipping re-initialization');
      return;
    }

    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
      clientTracking: true
    });

    this.wss.on('connection', (ws, req) => {
      try {
        // Verify JWT token from cookie header or Authorization header
        const authHeader = req.headers['authorization'] || '';
        let token = null;
        if (authHeader && String(authHeader).startsWith('Bearer ')) {
          token = String(authHeader).slice(7);
        }

        // Parse cookies if not provided via Authorization
        if (!token && req.headers && req.headers.cookie) {
          const cookieHeader = req.headers.cookie;
          const cookies = Object.fromEntries(cookieHeader.split(';').map(c => {
            const [k, ...v] = c.split('=');
            return [k.trim(), decodeURIComponent(v.join('='))];
          }));
          if (cookies.token) token = cookies.token;
        }

        const decoded = token ? verifyToken(token) : null;
        if (!decoded) {
          console.warn('📡 WebSocket connection rejected: missing or invalid token from', req.socket.remoteAddress);
          try { ws.close(1008, 'Unauthorized'); } catch (e) { /* ignore */ }
          return;
        }

        ws._username = decoded.username || 'unknown';

        console.log(`📡 WebSocket client connected from ${req.socket.remoteAddress} as ${ws._username}`);
        this.clients.add(ws);

        // Mark client as alive for heartbeat
        ws.isAlive = true;

        // Send initial connection message
        try {
          ws.send(JSON.stringify({
            type: 'connection',
            message: 'Connected to Watchman WebSocket server',
            timestamp: new Date().toISOString()
          }));
        } catch (err) {
          console.warn('📡 Failed to send welcome message to client', err && err.message ? err.message : err);
        }

      } catch (err) {
        console.error('📡 Error during WebSocket connection handshake:', err && err.message ? err.message : err);
        try { ws.close(1011, 'Internal error'); } catch (e) { /* ignore */ }
        return;
      }

      // Handle client disconnect
      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('📡 WebSocket client disconnected');
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
    this._heartbeatInterval = setInterval(() => {
      if (!this.wss) return;
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          console.log('📡 Terminating dead WebSocket connection');
          try { ws.terminate(); } catch (e) { /* ignore */ }
          return;
        }

        ws.isAlive = false;
        try { ws.ping(); } catch (e) { /* ignore */ }
      });
    }, 30000); // 30 seconds

    this.wss.on('close', () => {
      if (this._heartbeatInterval) {
        clearInterval(this._heartbeatInterval);
        this._heartbeatInterval = null;
      }
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
      console.debug(`📡 Broadcasted ${serviceName} update to ${sentCount} clients`);
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

    console.debug(`📡 Broadcasted ${level} alert: ${message}`);
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
    if (!this.wss) return;

    console.info('📡 Shutting down WebSocket server...');

    // Stop heartbeat
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }

    // Terminate all clients
    try {
      this.wss.clients.forEach((ws) => {
        try { ws.terminate(); } catch (e) { /* ignore */ }
      });
    } catch (e) {
      // ignore
    }

    // Close the server
    try {
      this.wss.close(() => {
        console.info('📡 WebSocket server closed');
      });
    } catch (e) {
      console.warn('📡 Error closing WebSocket server', e && e.message ? e.message : e);
    }

    this.clients.clear();
    this.wss = null;
  }
}

export default new WebSocketManager();