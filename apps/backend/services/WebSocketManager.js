/**
 * WebSocket Manager
 *
 * Manages WebSocket connections for real-time communication with frontend clients.
 * Implements secure authentication, connection lifecycle management, heartbeat
 * monitoring, and event broadcasting with proper error handling.
 *
 * @fileoverview Real-time WebSocket communication manager
 * @author Watchman Team
 * @version 1.0.0
 */

import { WebSocketServer } from "ws";
import EventEmitter from "events";
import { verifyToken } from "../middleware/auth.js";
import { logger } from "../middleware/logger.js";

/**
 * WebSocket Manager Class
 *
 * Extends EventEmitter to provide real-time communication capabilities.
 * Handles client authentication, connection management, and message broadcasting.
 */
export class WebSocketManager extends EventEmitter {
  /**
   * Create a WebSocketManager instance
   */
  constructor() {
    super();

    /** @type {WebSocketServer|null} WebSocket server instance */
    this.wss = null;

    /** @type {Set<WebSocket>} Set of connected WebSocket clients */
    this.clients = new Set();

    /** @type {boolean} Whether WebSocket functionality is enabled */
    this.isEnabled = process.env.ENABLE_WEBSOCKETS !== "false";

    /** @type {NodeJS.Timer|null} Heartbeat interval timer */
    this._heartbeatInterval = null;

    /** @type {number} Heartbeat interval in milliseconds */
    this.heartbeatInterval =
      parseInt(process.env.WEBSOCKET_HEARTBEAT_INTERVAL) || 30000;

    /** @type {number} Maximum number of connections per IP */
    this.maxConnectionsPerIp =
      parseInt(process.env.WEBSOCKET_MAX_CONNECTIONS_PER_IP) || 5;

    /** @type {Map<string, number>} Track connections per IP address */
    this.connectionsByIp = new Map();
  }

  /**
   * Initialize WebSocket server with HTTP server instance
   *
   * @param {http.Server} server - HTTP server instance
   */
  initialize(server) {
    if (!this.isEnabled) {
      logger.info("WebSocket functionality disabled via environment variable");
      return;
    }

    if (this.wss) {
      logger.warn(
        "WebSocket server already initialized; skipping re-initialization"
      );
      return;
    }

    this.wss = new WebSocketServer({
      server,
      path: "/ws",
      clientTracking: true,
      maxPayload: 64 * 1024, // 64KB max payload - reduced from 1MB for DoS protection
    });

    this.wss.on("connection", (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.wss.on("error", (error) => {
      logger.error("WebSocket server error", { error: error.message });
    });

    // Start heartbeat monitoring
    this.startHeartbeat();

    logger.info("WebSocket server initialized", {
      path: "/ws",
      heartbeatInterval: this.heartbeatInterval,
      maxConnectionsPerIp: this.maxConnectionsPerIp,
    });
  }

  /**
   * Handle new WebSocket connection
   *
   * @param {WebSocket} ws - WebSocket connection
   * @param {http.IncomingMessage} req - HTTP request object
   * @private
   */
  handleConnection(ws, req) {
    try {
      const clientIp = this.getClientIp(req);

      // Rate limiting: Check connections per IP
      const existingConnections = this.connectionsByIp.get(clientIp) || 0;
      if (existingConnections >= this.maxConnectionsPerIp) {
        logger.warn(
          "WebSocket connection rejected: too many connections from IP",
          {
            ip: clientIp,
            connections: existingConnections,
          }
        );
        ws.close(1008, "Too many connections from this IP");
        return;
      }

      // Verify authentication
      const authResult = this.authenticateConnection(ws, req);
      if (!authResult.success) {
        logger.warn("WebSocket authentication failed", {
          ip: clientIp,
          reason: authResult.reason,
        });
        ws.close(1008, "Authentication required");
        return;
      }

      // Setup client connection
      this.setupClient(ws, clientIp, authResult.user);
    } catch (error) {
      logger.error("Error handling WebSocket connection", {
        error: error.message,
        ip: this.getClientIp(req),
      });
      ws.close(1011, "Internal server error");
    }
  }

  /**
   * Authenticate WebSocket connection using JWT token
   *
   * @param {WebSocket} ws - WebSocket connection
   * @param {http.IncomingMessage} req - HTTP request object
   * @returns {Object} Authentication result
   * @private
   */
  authenticateConnection(ws, req) {
    // Extract token from Authorization header or cookies
    let token = this.extractToken(req);

    if (!token) {
      return { success: false, reason: "No authentication token provided" };
    }

    // Verify JWT token
    const decoded = verifyToken(token);
    if (!decoded) {
      return { success: false, reason: "Invalid or expired token" };
    }

    return {
      success: true,
      user: {
        username: decoded.username,
        id: decoded.sub || decoded.id,
      },
    };
  }

  /**
   * Extract authentication token from request
   *
   * @param {http.IncomingMessage} req - HTTP request object
   * @returns {string|null} JWT token or null if not found
   * @private
   */
  extractToken(req) {
    // Check Authorization header first
    const authHeader = req.headers["authorization"] || "";
    if (authHeader && String(authHeader).startsWith("Bearer ")) {
      return String(authHeader).slice(7);
    }

    // Parse cookies as fallback
    if (req.headers?.cookie) {
      const cookieHeader = req.headers.cookie;
      const cookies = Object.fromEntries(
        cookieHeader.split(";").map((c) => {
          const [key, ...value] = c.split("=");
          return [key.trim(), decodeURIComponent(value.join("="))];
        })
      );
      return cookies.token || null;
    }

    return null;
  }

  /**
   * Get client IP address from request
   *
   * @param {http.IncomingMessage} req - HTTP request object
   * @returns {string} Client IP address
   * @private
   */
  getClientIp(req) {
    return (
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.headers["x-real-ip"] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      "unknown"
    );
  }

  /**
   * Setup WebSocket client connection
   *
   * @param {WebSocket} ws - WebSocket connection
   * @param {string} clientIp - Client IP address
   * @param {Object} user - User information
   * @private
   */
  setupClient(ws, clientIp, user) {
    // Track connection count per IP
    const currentConnections = this.connectionsByIp.get(clientIp) || 0;
    this.connectionsByIp.set(clientIp, currentConnections + 1);

    // Store user info on WebSocket
    ws._username = user.username;
    ws._clientIp = clientIp;
    ws._connectedAt = new Date();

    // Add to active clients
    this.clients.add(ws);

    // Mark as alive for heartbeat monitoring
    ws.isAlive = true;

    // Setup event handlers
    this.setupClientHandlers(ws, clientIp);

    logger.info("WebSocket client connected", {
      ip: clientIp,
      username: user.username,
      totalClients: this.clients.size,
    });

    // Send welcome message
    this.sendWelcomeMessage(ws);
  }

  /**
   * Setup WebSocket client event handlers
   *
   * @param {WebSocket} ws - WebSocket connection
   * @param {string} clientIp - Client IP address
   * @private
   */
  setupClientHandlers(ws, clientIp) {
    // Handle pong responses for heartbeat
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    // Handle client messages
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleClientMessage(ws, message);
      } catch (error) {
        logger.warn("Invalid WebSocket message received", {
          error: error.message,
          ip: clientIp,
        });
      }
    });

    // Handle disconnection
    ws.on("close", () => {
      this.handleClientDisconnect(ws, clientIp);
    });

    // Handle errors
    ws.on("error", (error) => {
      logger.warn("WebSocket client error", {
        error: error.message,
        ip: clientIp,
        username: ws._username,
      });
      this.handleClientDisconnect(ws, clientIp);
    });
  }

  /**
   * Handle client disconnection
   *
   * @param {WebSocket} ws - WebSocket connection
   * @param {string} clientIp - Client IP address
   * @private
   */
  handleClientDisconnect(ws, clientIp) {
    this.clients.delete(ws);

    // Decrease connection count for IP
    const currentConnections = this.connectionsByIp.get(clientIp) || 0;
    if (currentConnections <= 1) {
      this.connectionsByIp.delete(clientIp);
    } else {
      this.connectionsByIp.set(clientIp, currentConnections - 1);
    }

    logger.info("WebSocket client disconnected", {
      ip: clientIp,
      username: ws._username,
      totalClients: this.clients.size,
    });
  }

  /**
   * Send welcome message to new client
   *
   * @param {WebSocket} ws - WebSocket connection
   * @private
   */
  sendWelcomeMessage(ws) {
    try {
      ws.send(
        JSON.stringify({
          type: "connection",
          message: "Connected to Watchman WebSocket server",
          timestamp: new Date().toISOString(),
          serverVersion: "1.0.0",
        })
      );
    } catch (error) {
      logger.warn("Failed to send welcome message", {
        error: error.message,
        username: ws._username,
      });
    }
  }

  /**
   * Handle incoming client messages
   *
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Parsed message object
   * @private
   */
  handleClientMessage(ws, message) {
    // Handle different message types
    switch (message.type) {
      case "ping":
        ws.send(
          JSON.stringify({
            type: "pong",
            timestamp: new Date().toISOString(),
          })
        );
        break;
      case "subscribe":
        // Handle subscription requests
        this.handleSubscription(ws, message);
        break;
      default:
        logger.warn("Unknown message type received", {
          type: message.type,
          username: ws._username,
        });
    }
  }

  /**
   * Handle subscription requests
   *
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Subscription message
   * @private
   */
  handleSubscription(ws, message) {
    // Implementation for handling service subscriptions
    logger.debug("WebSocket subscription request", {
      service: message.service,
      username: ws._username,
    });
  }

  /**
   * Start heartbeat monitoring
   *
   * @private
   */
  startHeartbeat() {
    this._heartbeatInterval = setInterval(() => {
      if (!this.wss) return;

      this.clients.forEach((ws) => {
        if (!ws.isAlive) {
          logger.debug("Terminating inactive WebSocket connection", {
            username: ws._username,
          });
          ws.terminate();
          return;
        }

        ws.isAlive = false;
        try {
          ws.ping();
        } catch (error) {
          logger.warn("Failed to ping WebSocket client", {
            error: error.message,
            username: ws._username,
          });
        }
      });
    }, this.heartbeatInterval);

    // Cleanup on server close
    if (this.wss) {
      this.wss.on("close", () => {
        if (this._heartbeatInterval) {
          clearInterval(this._heartbeatInterval);
          this._heartbeatInterval = null;
        }
      });
    }
  }

  /**
   * Broadcast service health updates to all connected clients
   *
   * @param {string} serviceName - Name of the service
   * @param {Object} data - Health data to broadcast
   */
  broadcastServiceUpdate(serviceName, data) {
    if (!this.isEnabled || !this.wss) return;

    const message = JSON.stringify({
      type: "service_update",
      service: serviceName,
      data,
      timestamp: new Date().toISOString(),
    });

    this.broadcastMessage(message, `${serviceName} update`);
  }

  /**
   * Broadcast alert messages to all connected clients
   *
   * @param {string} level - Alert level (info, warning, error)
   * @param {string} message - Alert message
   * @param {string|null} service - Optional service name
   */
  broadcastAlert(level, message, service = null) {
    if (!this.isEnabled || !this.wss) return;

    const alertMessage = JSON.stringify({
      type: "alert",
      level,
      message,
      service,
      timestamp: new Date().toISOString(),
    });

    this.broadcastMessage(alertMessage, `${level} alert`);
  }

  /**
   * Broadcast message to all connected clients
   *
   * @param {string} message - JSON message to broadcast
   * @param {string} description - Description for logging
   * @private
   */
  broadcastMessage(message, description) {
    let sentCount = 0;
    const disconnectedClients = [];

    this.clients.forEach((ws) => {
      if (ws.readyState === ws.OPEN) {
        try {
          ws.send(message);
          sentCount++;
        } catch (error) {
          logger.warn("Failed to send WebSocket message", {
            error: error.message,
            username: ws._username,
          });
          disconnectedClients.push(ws);
        }
      } else {
        disconnectedClients.push(ws);
      }
    });

    // Clean up disconnected clients
    disconnectedClients.forEach((ws) => this.clients.delete(ws));

    if (sentCount > 0) {
      logger.debug(`Broadcasted ${description} to ${sentCount} clients`);
    }
  }

  /**
   * Get WebSocket server statistics
   *
   * @returns {Object} Server statistics
   */
  getStats() {
    const connectionsByIp = {};
    this.connectionsByIp.forEach((count, ip) => {
      connectionsByIp[ip] = count;
    });

    return {
      enabled: this.isEnabled,
      totalConnections: this.clients.size,
      connectionsByIp,
      heartbeatInterval: this.heartbeatInterval,
      maxConnectionsPerIp: this.maxConnectionsPerIp,
    };
  }

  /**
   * Gracefully shutdown WebSocket server
   */
  shutdown() {
    if (!this.isEnabled || !this.wss) return;

    logger.info("Shutting down WebSocket server...");

    // Stop heartbeat
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }

    // Close all client connections
    this.clients.forEach((ws) => {
      try {
        ws.close(1000, "Server shutting down");
      } catch (error) {
        logger.warn("Error closing WebSocket connection", {
          error: error.message,
        });
      }
    });

    // Close server
    this.wss.close(() => {
      logger.info("WebSocket server closed");
    });

    this.clients.clear();
    this.connectionsByIp.clear();
  }
}

// Export singleton instance
const webSocketManager = new WebSocketManager();
export default webSocketManager;
