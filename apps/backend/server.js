import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { createServer } from "http";
import swaggerUi from "swagger-ui-express";
import fs from "fs";
import YAML from "js-yaml";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import ServiceManager from "./services/ServiceManager.js";
import WebSocketManager from "./services/WebSocketManager.js";
import performanceMonitor from "./middleware/performanceMonitor.js";
import {
  clearCache,
  healthCacheMiddleware,
  statsCacheMiddleware,
} from "./middleware/cache.js";
import {
  authLimiter,
  controlLimiter,
  generalLimiter,
  healthLimiter,
} from "./middleware/rateLimiting.js";
import cookieParser from "cookie-parser";
import {
  authenticateCredentials,
  requireAuth,
  signToken,
  verifyToken,
} from "./middleware/auth.js";
import { issueCsrfToken, verifyCsrf } from "./middleware/csrf.js";
import {
  checkLockout,
  recordFailedLogin,
  resetLoginAttempts,
} from "./middleware/accountLockout.js";
import { requireBoolean, requireFields } from "./middleware/validation.js";
import { spawn } from "child_process";
import { getConfig, cachedConfig, validateEnvironment } from "./config.js";
import logger, {
  requestIdMiddleware,
  requestLogger,
} from "./middleware/logger.js";
import {
  requireWhitelistedIP,
  enforceIPControl,
} from "./middleware/ipControl.js";
import {
  requireAnyServiceEnabled,
  requireServiceEnabled,
} from "./middleware/serviceEnabled.js";
import { getFrontendConfig } from "./services/FrontendConfigService.js";
import requestTimeout from "./middleware/requestTimeout.js";
import responseSizeLimit from "./middleware/responseSizeLimit.js";
import apiResponseStandardizer from "./middleware/apiResponse.js";
import { paginate, parsePagination } from "./utils/pagination.js";
import {
  sanitizeString,
  isValidIPv4,
  isValidServiceId,
  validateParams,
  validateQuery,
} from "./utils/validation.js";
import { destroyAgents } from "./utils/httpAgentPool.js";
import {
  createServiceRoutes,
  createUpdatesRoute,
} from "./routes/serviceFactory.js";

// Helper to determine if an IP is unicast (not multicast or link-local)
const isUnicast = (ip) => {
  if (!ip || typeof ip !== "string") return false;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  // Multicast 224.0.0.0/4
  if (parts[0] >= 224 && parts[0] <= 239) return false;
  // Link-local 169.254.0.0/16
  if (parts[0] === 169 && parts[1] === 254) return false;
  return true;
};

// Helper to check services health - shared between /api/services/health and /api/services/health-batch
async function checkServicesHealth(services) {
  const healthPromises = services.map(async (serviceName) => {
    try {
      const health = await Promise.race([
        serviceManager.getServiceHealth(serviceName),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Health check timeout")), 5000)
        ),
      ]);
      return [serviceName, health];
    } catch (error) {
      return [
        serviceName,
        {
          status: "offline",
          error: error.message,
          timestamp: new Date().toISOString(),
        },
      ];
    }
  });

  const results = await Promise.all(healthPromises);
  const healthResults = {};
  for (const [serviceName, health] of results) {
    healthResults[serviceName] = health;
  }
  return healthResults;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Validate environment before starting server
validateEnvironment();

const config = getConfig();
const app = express();
// Trust proxy for correct ip detection behind reverse proxies
app.set("trust proxy", 1);
const server = createServer(app);
const PORT = config.server.port;
const FRONTEND_URLS = (config.server.frontendUrl || "")
  .split(/[ ,]+/)
  .map((o) => o.trim())
  .filter(Boolean);
const FRONTEND_URL = FRONTEND_URLS[0] || config.server.frontendUrl;
const COOKIE_DOMAIN_OVERRIDE = process.env.COOKIE_DOMAIN || null;
const DISABLE_COOKIE_DOMAIN =
  (process.env.COOKIE_STRICT_DOMAIN || "").toLowerCase() === "false" ||
  FRONTEND_URLS.length > 1;
const COOKIE_DOMAIN =
  DISABLE_COOKIE_DOMAIN && !COOKIE_DOMAIN_OVERRIDE
    ? null
    : COOKIE_DOMAIN_OVERRIDE ||
      (() => {
        try {
          const hostname = FRONTEND_URL ? new URL(FRONTEND_URL).hostname : null;
          // Only set domain if hostname includes a dot (not localhost/127.0.0.1)
          return hostname && hostname.includes(".") ? hostname : null;
        } catch (_err) {
          return null;
        }
      })();
const FRONTEND_HTTPS = FRONTEND_URLS.some((url) => url?.startsWith("https://"));
const APP_VERSION = (() => {
  const candidates = [
    join(__dirname, "package.json"),
    join(__dirname, "..", "package.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
        if (pkg && pkg.version) return pkg.version;
      } catch (_err) {
        // ignore parse errors
      }
    }
  }
  return "1.0.0";
})();

// Production security checks
if (process.env.NODE_ENV === "production") {
  // Enforce FRONTEND_URL in production to avoid open CORS
  if (FRONTEND_URLS.length === 0) {
    logger.error(
      "FRONTEND_URL must be set to your frontend origin(s) in production to avoid open CORS."
    );
    process.exit(1);
  }

  // Ensure HTTPS in production
  const nonHttpsOrigins = FRONTEND_URLS.filter(
    (url) => !url.startsWith("https://")
  );
  if (nonHttpsOrigins.length > 0) {
    logger.warning(
      "All FRONTEND_URL origins should use HTTPS in production for security"
    );
  }

  // Validate JWT secret is set and strong
  if (!config.auth.jwtSecret || config.auth.jwtSecret.length < 32) {
    logger.error(
      "JWT_SECRET must be at least 32 characters long in production"
    );
    process.exit(1);
  }
}

// Cookie defaults with improved security
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production" ? true : false,
  sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
  path: "/",
  ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
};

// Initialize service manager and WebSocket
let serviceManager;
let httpServerInstance = null;

/**
 * Global error handlers for production-ready error management
 * Ensures graceful handling of unexpected errors and proper logging
 */
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception - Critical Error", {
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  });

  if (process.env.NODE_ENV === "production") {
    // Perform graceful shutdown in production
    handleGracefulShutdown("uncaughtException");
  } else {
    // In development, still exit but with more visible error
    logger.error("Uncaught Exception - Critical Error", {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Promise Rejection", {
    reason: reason?.toString() || "Unknown reason",
    promise: promise.toString(),
    timestamp: new Date().toISOString(),
  });

  if (process.env.NODE_ENV === "production") {
    // Perform graceful shutdown in production
    handleGracefulShutdown("unhandledRejection");
  } else {
    // In development, still exit but with more visible error
    logger.error("Unhandled Promise Rejection - Critical Error", {
      reason: reason?.toString() || "Unknown reason",
    });
    process.exit(1);
  }
});

/**
 * Process signal handlers for graceful shutdown
 * Handles SIGINT (Ctrl+C) and SIGTERM signals
 */
process.on("SIGINT", () => {
  logger.info("Received SIGINT signal, initiating graceful shutdown");
  handleGracefulShutdown("SIGINT");
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM signal, initiating graceful shutdown");
  handleGracefulShutdown("SIGTERM");
});

async function initializeServer() {
  logger.startup("Initializing Watchman Backend Server");
  logger.startup(`Environment: ${process.env.NODE_ENV || "development"}`);
  logger.startup(`Frontend URL: ${FRONTEND_URL}`);
  logger.startup(`Port: ${PORT}`);

  try {
    serviceManager = new ServiceManager();
    await serviceManager.initializeServices();

    // Initialize WebSocket server
    WebSocketManager.initialize(server);

    logger.success("Service initialization complete");
  } catch (error) {
    logger.error("Failed to initialize services", { error });
    process.exit(1);
  }
}

// Enhanced middleware with production-ready security
app.use(requestIdMiddleware); // Add request ID tracking
app.use(requestLogger); // Add structured logging
app.use(performanceMonitor.trackRequest());
app.use(enforceIPControl); // IP access control
app.use(requestTimeout); // Global request timeout to prevent hanging requests
app.use(responseSizeLimit()); // Prevent large response DoS attacks
app.use(
  apiResponseStandardizer({
    autoWrap: true,
  })
);

// Enhanced Helmet configuration for production
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", ...(FRONTEND_URL ? [FRONTEND_URL] : [])],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    xssFilter: true,
    hidePoweredBy: true,
    frameguard: { action: "deny" },
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
  })
);

// Add Permissions-Policy header and enhanced security headers
app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"
  );

  // Add additional security headers for production-ready deployment
  res.setHeader("X-Request-ID", req.requestId || req.id || "unknown");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Download-Options", "noopen");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  // Remove server information
  res.removeHeader("X-Powered-By");

  next();
});

app.use(compression({ level: 6, threshold: 1024 }));

// Enhanced CORS configuration with explicit origin validation
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin or explicit FRONTEND_URL; block others in production
      if (!origin) return callback(null, true);

      // Validate that FRONTEND_URL is properly configured
      if (!FRONTEND_URL || FRONTEND_URL === "*") {
        if (process.env.NODE_ENV === "production") {
          return callback(
            new Error("CORS: FRONTEND_URL not configured in production")
          );
        }
        // Allow any origin in development if not configured
        return callback(null, true);
      }

      // Validate the format of the origin
      try {
        new URL(origin);
      } catch (e) {
        return callback(new Error("CORS: Invalid origin format"));
      }

      // Check if origin matches FRONTEND_URL
      const allowed = [FRONTEND_URL];
      if (!allowed.includes(origin)) {
        if (process.env.NODE_ENV === "production") {
          return callback(new Error(`CORS: Origin ${origin} not allowed`));
        }
        // More permissive in development
        return callback(null, true);
      }

      return callback(null, true);
    },
    credentials: true,
    maxAge: 86400, // 24 hours
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

// Serve Swagger API documentation
const swaggerDocument = YAML.load(
  fs.readFileSync(join(__dirname, "api-docs.yaml"), "utf8")
);

app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument, { explorer: true })
);

// Apply rate limiting
app.use("/api/", generalLimiter);

// Authentication endpoints
app.post(
  "/api/auth/login",
  authLimiter,
  checkLockout,
  requireFields(["username", "password"]),
  async (req, res) => {
    const { username, password } = req.body;
    const ip = req.ip;

    try {
      const user = await authenticateCredentials(username, password);

      if (!user) {
        await recordFailedLogin(username, ip);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // On successful login, reset failed attempts
      await resetLoginAttempts(username, ip);

      // Issue tokens
      const accessToken = signToken({ sub: user.id }, "access");

      // Set secure HTTP-only cookie with CSRF protection
      res.cookie("token", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 8 * 60 * 60 * 1000, // 8 hours
      });

      // Issue a double-submit CSRF token cookie (accessible to JS)
      issueCsrfToken(res);

      res.status(200).json({
        message: "Login successful",
        token: accessToken,
        user: { username: user.username, id: user.id },
      });
    } catch (error) {
      logger.error("Login error", { error: error.message });
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

app.post("/api/auth/logout", requireAuth, async (req, res) => {
  res.clearCookie("token", Object.assign({}, COOKIE_OPTIONS));
  // Clear csrf cookie too
  res.clearCookie(process.env.CSRF_COOKIE_NAME || "csrfToken", { path: "/" });
  res.json({ success: true });
});

app.get("/api/auth/me", (req, res) => {
  const authHeader = req.headers.authorization;
  let token = null;
  if (
    authHeader &&
    typeof authHeader === "string" &&
    authHeader.startsWith("Bearer ")
  ) {
    token = authHeader.slice(7);
  }
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  if (!token) return res.status(200).json({ authenticated: false });
  const decoded = verifyToken(token);
  if (!decoded) return res.status(200).json({ authenticated: false });

  // Refresh CSRF token on authenticated status so client can continue to send it
  issueCsrfToken(res);
  return res.json({
    authenticated: true,
    user: { username: decoded.username },
  });
});

// Health check endpoint
app.get("/health", healthLimiter, (req, res) => {
  res.locals.skipStandardization = true;
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "watchman-backend",
    version: APP_VERSION,
  });
});

// Cache management endpoint - requires auth + CSRF verification
app.post(
  "/api/cache/clear",
  controlLimiter,
  requireAuth,
  verifyCsrf,
  (req, res) => {
    const { type } = req.body || {};

    // If provided, type must be a non-empty string
    if (
      type !== undefined &&
      (typeof type !== "string" || type.trim().length === 0)
    ) {
      return res.status(400).json({ error: "Invalid cache type" });
    }

    clearCache(type);
    res.json({ success: true, message: `Cache cleared: ${type || "all"}` });
  }
);

// AdGuard protection endpoint - require boolean 'enabled' and optional numeric 'duration'
app.post(
  "/api/adguard/protection",
  controlLimiter,
  requireAuth,
  verifyCsrf,
  requireServiceEnabled("adguard"),
  requireBoolean("enabled"),
  async (req, res) => {
    try {
      const adguardService = serviceManager.getService("adguard");
      if (!adguardService) {
        return res
          .status(503)
          .json({ error: "AdGuard service not configured" });
      }

      const { enabled, duration } = req.body;

      // optional duration validation
      if (duration !== undefined && typeof duration !== "number") {
        return res
          .status(400)
          .json({ error: "Duration must be a number (seconds)" });
      }

      await adguardService.setProtection(enabled, duration);
      logger.service(
        "adguard",
        `Protection ${enabled ? "enabled" : "disabled"}`
      );

      // Clear cache after control actions
      clearCache("health");
      clearCache("stats");

      res.json({ success: true });
    } catch (error) {
      logger.error("AdGuard protection toggle failed", {
        error: error.message,
      });
      res.status(500).json({
        error: "Failed to toggle AdGuard protection",
        message: error.message,
      });
    }
  }
);

// Generic multi-instance service endpoints (handle instanceId patterns like qbittorrent_1, qbittorrent_2)
// These routes handle dynamic service instances and must come before specific hardcoded service routes
// They will match patterns like /api/qbittorrent_1/status, /api/qbittorrent_2/stats, etc.
app.get(
  "/api/:serviceId(\\w+_\\d+)/status",
  healthLimiter,
  validateParams({
    serviceId: {
      validator: isValidServiceId,
    },
  }),
  healthCacheMiddleware,
  async (req, res) => {
    try {
      const { serviceId } = req.params;

      // Check if this is a valid service instance
      const service = serviceManager.getService(serviceId);
      if (!service) {
        return res.status(404).json({
          error: `Service '${serviceId}' not found`,
          status: "offline",
        });
      }

      const health = await serviceManager.getServiceHealth(serviceId);
      res.json(health);
    } catch (error) {
      logger.error(`Service ${req.params.serviceId} status failed`, {
        error: error.message,
        serviceId: req.params.serviceId,
      });
      res.status(500).json({
        error: `Failed to fetch ${req.params.serviceId} status`,
        status: "offline",
        message: error.message,
      });
    }
  }
);

app.get(
  "/api/:serviceId(\\w+_\\d+)/stats",
  requireAuth, // Add authentication requirement
  validateParams({
    serviceId: {
      validator: isValidServiceId,
    },
  }),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const { serviceId } = req.params;

      // Check if this is a valid service instance
      const service = serviceManager.getService(serviceId);
      if (!service) {
        return res.status(404).json({
          error: `Service '${serviceId}' not found`,
        });
      }

      const stats = await serviceManager.getServiceStats(serviceId);
      res.json(stats);
    } catch (error) {
      logger.error(`Service ${req.params.serviceId} stats failed`, {
        error: error.message,
        serviceId: req.params.serviceId,
      });
      res.status(500).json({
        error: `Failed to fetch ${req.params.serviceId} stats`,
        message: error.message,
      });
    }
  }
);

// ── Service routes via factory ──────────────────────────────────
const factoryMiddleware = {
  healthLimiter,
  requireServiceEnabled,
  requireAuth,
  healthCacheMiddleware,
  statsCacheMiddleware,
};

// Standard services: status + stats via factory
for (const svc of [
  "adguard",
  "qbittorrent",
  "ipfs",
  "roon",
  "synology",
  "philips",
  "albyhub",
  "macmini",
  "raspi",
]) {
  app.use(
    `/api/${svc}`,
    createServiceRoutes(svc, serviceManager, factoryMiddleware)
  );
}

// Bitcoin: /status + /stats via factory, plus /health alias
app.use(
  "/api/bitcoin",
  createServiceRoutes("bitcoin", serviceManager, factoryMiddleware)
);
app.get(
  "/api/bitcoin/health",
  healthLimiter,
  requireServiceEnabled("bitcoin"),
  healthCacheMiddleware,
  async (req, res) => {
    try {
      const svc = serviceManager.getService("bitcoin");
      if (!svc)
        return res
          .status(503)
          .json({ error: "Bitcoin service not configured", status: "offline" });
      const health = await serviceManager.getServiceHealth("bitcoin");
      res.json(health);
    } catch (error) {
      logger.error("Bitcoin health connection failed", {
        error: error.message,
      });
      res.status(500).json({
        error: "Failed to fetch Bitcoin health",
        status: "offline",
        message: error.message,
      });
    }
  }
);

// Tor: /status + /stats via factory, plus /health alias and /relay/:nickname?
app.use(
  "/api/tor",
  createServiceRoutes("tor", serviceManager, factoryMiddleware)
);
app.get(
  "/api/tor/health",
  healthLimiter,
  requireServiceEnabled("tor"),
  healthCacheMiddleware,
  async (req, res) => {
    try {
      const svc = serviceManager.getService("tor");
      if (!svc)
        return res.status(503).json({ error: "Tor service not configured" });
      const health = await serviceManager.getServiceHealth("tor");
      res.json(health);
    } catch (error) {
      logger.error("Tor health check connection failed", {
        error: error.message,
      });
      res
        .status(500)
        .json({ error: "Failed to check Tor health", message: error.message });
    }
  }
);
app.get(
  "/api/tor/relay/:nickname?",
  requireServiceEnabled("tor"),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const svc = serviceManager.getService("tor");
      if (!svc)
        return res.status(503).json({ error: "Tor service not configured" });
      const stats = await serviceManager.getServiceStats("tor");
      res.json(stats);
    } catch (error) {
      logger.error("Tor relay connection failed", { error: error.message });
      res.status(500).json({
        error: "Failed to fetch Tor relay data",
        message: error.message,
      });
    }
  }
);

// Homebridge: /status + /stats via factory, plus special endpoints
app.use(
  "/api/homebridge",
  createServiceRoutes("homebridge", serviceManager, factoryMiddleware)
);
app.get(
  "/api/status/homebridge-version",
  requireServiceEnabled("homebridge"),
  statsCacheMiddleware,
  requireAuth,
  async (req, res) => {
    try {
      const svc = serviceManager.getService("homebridge");
      if (!svc)
        return res
          .status(503)
          .json({ error: "Homebridge service not configured" });
      if (typeof svc.getVersion === "function") {
        const ver = await svc.getVersion();
        return res.json(ver);
      }
      const stats = await svc.getStats();
      res.json({
        version: stats?.data?.version || stats?.version || null,
        raw: stats,
      });
    } catch (error) {
      logger.error("/api/status/homebridge-version failed", {
        error: error.message,
      });
      res.status(500).json({
        error: "Failed to fetch Homebridge version",
        message: error.message,
      });
    }
  }
);
app.get(
  "/api/status/server-information",
  requireServiceEnabled("homebridge"),
  statsCacheMiddleware,
  requireAuth,
  async (req, res) => {
    try {
      const svc = serviceManager.getService("homebridge");
      if (!svc)
        return res
          .status(503)
          .json({ error: "Homebridge service not configured" });
      if (typeof svc.getServerInformation === "function") {
        const info = await svc.getServerInformation();
        return res.json(info);
      }
      const health = await serviceManager.getServiceHealth("homebridge");
      res.json({
        data: health && health.data ? health.data : null,
        raw: health,
      });
    } catch (error) {
      logger.error("/api/status/server-information failed", {
        error: error.message,
      });
      res.status(500).json({
        error: "Failed to fetch server information",
        message: error.message,
      });
    }
  }
);
app.get(
  "/api/accessories",
  requireServiceEnabled("homebridge"),
  statsCacheMiddleware,
  requireAuth,
  parsePagination({
    pageParam: "page",
    limitParam: "limit",
    defaultLimit: 50,
    maxLimit: 100,
  }),
  async (req, res) => {
    try {
      const svc = serviceManager.getService("homebridge");
      if (!svc)
        return res
          .status(503)
          .json({ error: "Homebridge service not configured" });
      if (typeof svc.getAccessories === "function") {
        const accessories = await svc.getAccessories();
        return res.json(paginate(accessories, req.pagination));
      }
      res.status(501).json({
        error:
          "Accessories endpoint not implemented for this Homebridge service",
      });
    } catch (error) {
      logger.error("/api/accessories failed", { error: error.message });
      res
        .status(500)
        .json({ error: "Failed to fetch accessories", message: error.message });
    }
  }
);

// Synology stats override (extra null-check)
app.get(
  "/api/synology/stats",
  requireServiceEnabled("synology"),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const svc = serviceManager.getService("synology");
      if (!svc)
        return res
          .status(503)
          .json({ error: "Synology service not configured" });
      const stats = await serviceManager.getServiceStats("synology");
      if (stats === null || stats === undefined) {
        return res.status(500).json({
          error: "Synology stats returned null or undefined",
          status: "error",
          timestamp: new Date().toISOString(),
        });
      }
      res.json(stats);
    } catch (error) {
      logger.error("Synology stats connection failed", {
        error: error.message,
      });
      res.status(500).json({
        error: "Failed to fetch Synology stats",
        message: error.message,
        status: "error",
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ── Update check routes via factory ─────────────────────────────
for (const svc of ["adguard", "bitcoin", "tor", "homebridge"]) {
  app.use(
    `/api/${svc}`,
    createUpdatesRoute(svc, serviceManager, factoryMiddleware)
  );
}

// IPFS updates requires auth (special case)
app.get(
  "/api/ipfs/updates",
  requireAuth,
  requireServiceEnabled("ipfs"),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const svc = serviceManager.getService("ipfs");
      if (!svc)
        return res.status(503).json({ error: "IPFS service not configured" });
      const updateInfo = await svc.checkForUpdates();
      res.json(updateInfo);
    } catch (error) {
      logger.error("IPFS update check failed", { error: error.message });
      res.status(500).json({
        error: "Failed to check for IPFS updates",
        message: error.message,
      });
    }
  }
);

// ── Aggregate / meta routes ─────────────────────────────────────
app.get(
  "/api/services/health",
  healthLimiter,
  requireAuth,
  async (req, res) => {
    try {
      const enabledServices = cachedConfig.enabledServices;
      const services = Array.from(enabledServices);
      const healthResults = await checkServicesHealth(services);

      res.json({
        services: healthResults,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Services health check failed", {
        error: error.message,
      });
      res.status(500).json({
        error: "Failed to check services health",
        message: error.message,
      });
    }
  }
);

// Get health of a batch/subset of services - REQUIRES AUTHENTICATION
app.post(
  "/api/services/health-batch",
  healthLimiter,
  requireAuth,
  async (req, res) => {
    try {
      const MAX_BATCH_SIZE = 25;
      const rawServices = Array.isArray(req.body?.services)
        ? req.body.services
        : null;

      if (!rawServices) {
        return res.status(400).json({
          error: "Invalid request body. Expected { services: string[] }",
        });
      }

      if (rawServices.length > MAX_BATCH_SIZE) {
        return res.status(400).json({
          error: `Too many services requested. Maximum ${MAX_BATCH_SIZE}`,
        });
      }

      const services = [];
      const seen = new Set();

      for (const rawServiceName of rawServices) {
        const serviceName = sanitizeString(rawServiceName, 64);
        if (!serviceName || !isValidServiceId(serviceName)) {
          return res.status(400).json({
            error: `Invalid service id: ${String(rawServiceName)}`,
          });
        }

        if (!seen.has(serviceName)) {
          seen.add(serviceName);
          services.push(serviceName);
        }
      }

      if (services.length === 0) {
        return res.json({});
      }

      const healthResults = await checkServicesHealth(services);
      return res.json(healthResults);
    } catch (error) {
      logger.error("Batch services health check failed", {
        error: error?.message || String(error),
      });
      return res.status(500).json({
        error: "Failed to check batch services health",
        message: error?.message || String(error),
      });
    }
  }
);

// Frontend configuration endpoint
app.get("/api/config/frontend", getFrontendConfig);

// Service instances endpoint - returns metadata about multi-instance services
app.get("/api/services/instances", healthLimiter, requireAuth, (req, res) => {
  try {
    const serviceTypes = serviceManager.getServiceTypes();
    const instancesInfo = {};

    for (const serviceType of serviceTypes) {
      const instances = serviceManager.getServiceInstances(serviceType);
      instancesInfo[serviceType] = {
        count: instances.length,
        instances: instances.map((instanceId) => ({
          id: instanceId,
          type: serviceType,
        })),
      };
    }

    res.json({
      instances: instancesInfo,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to get service instances", {
      error: error.message,
    });
    res.status(500).json({
      error: "Failed to get service instances",
      message: error.message,
    });
  }
});

// Route: ARP / neighbor lookup for router services
// Returns: { count: number, hosts: Array<{ ip: string, mac?: string, iface?: string }> , raw?: string }
// SECURITY: Requires auth + CSRF + strict service validation to prevent command injection
const ALLOWED_ROUTER_SERVICES = new Set(["beryl", "telenet"]);

app.get(
  "/api/router/arp",
  controlLimiter,
  requireAuth,
  verifyCsrf,
  requireAnyServiceEnabled("beryl", "telenet"),
  validateQuery({
    service: {
      required: true,
      validator: (value) =>
        typeof value === "string" &&
        ALLOWED_ROUTER_SERVICES.has(sanitizeString(value, 32)),
      sanitizer: (value) => sanitizeString(value, 32),
    },
  }),
  parsePagination({
    pageParam: "page",
    limitParam: "limit",
    defaultLimit: 50,
    maxLimit: 100,
  }),
  async (req, res) => {
    try {
      const serviceName =
        typeof req.query.service === "string" ? req.query.service : null;

      // STRICT validation: only allow predefined router services
      if (!serviceName || !ALLOWED_ROUTER_SERVICES.has(serviceName)) {
        return res
          .status(400)
          .json({ error: "Invalid service. Allowed: beryl, telenet" });
      }

      const svc =
        serviceManager && typeof serviceManager.getService === "function"
          ? serviceManager.getService(serviceName)
          : null;
      if (!svc)
        return res
          .status(404)
          .json({ error: `Service '${serviceName}' not found` });

      const host = svc.host || null;
      if (!host)
        return res.status(400).json({
          error: `Service '${serviceName}' does not have a configured host`,
        });

      // Validate host is a proper IP address (prevent command injection)
      if (!isValidIPv4(host)) {
        logger.error("Router ARP: invalid host IP", { host, serviceName });
        return res
          .status(500)
          .json({ error: "Invalid router host configuration" });
      }

      // Choose platform-appropriate command and execute with spawn
      const platform = process.platform;
      const cmd = platform === "linux" ? "ip" : "arp";
      const args = platform === "linux" ? ["neigh"] : ["-a"];

      const out = await new Promise((resolve) => {
        const child = spawn(cmd, args, { timeout: 5000 });
        let stdout = "";
        child.stdout.on("data", (d) => {
          stdout += d.toString();
        });
        child.on("close", () => resolve(stdout));
        child.on("error", () => resolve(""));
      });

      const hostsMap = new Map();

      if (platform === "linux") {
        // Parse `ip neigh` lines like: "192.0.2.10 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE"
        const lines = out
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        for (const line of lines) {
          // ignore failed/incomplete entries
          if (/\b(INCOMPLETE|FAILED)\b/i.test(line)) continue;
          const m = line.match(
            /^(\d+\.\d+\.\d+\.\d+)\s+dev\s+(\S+)(?:.*lladdr\s+([0-9a-f:]{5,}))?(?:.*\b(REACHABLE|STALE|DELAY|PERMANENT)\b)?/i
          );
          if (m) {
            const ip = m[1];
            const iface = m[2] || null;
            const mac = m[3] || null;
            if (ip && !hostsMap.has(ip)) hostsMap.set(ip, { ip, mac, iface });
          }
        }
      } else {
        // macOS / BSD-style `arp -a`, lines like:
        // ? (192.0.2.5) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]
        const lines = out
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        for (const line of lines) {
          // skip incomplete entries
          if (/incomplete/i.test(line)) continue;
          const m = line.match(
            /\(?([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)\)?\s+at\s+([0-9a-f:]{5,})\s+on\s+(\S+)/i
          );
          if (m) {
            const ip = m[1];
            const mac = m[2] || null;
            const iface = m[3] || null;
            if (ip && !hostsMap.has(ip)) hostsMap.set(ip, { ip, mac, iface });
          } else {
            // Fallback: try to extract e.g. "hostname (192.0.2.2) at ..."
            const alt = line.match(
              /\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-f:]{5,})/i
            );
            if (alt) {
              const ip = alt[1];
              const mac = alt[2] || null;
              if (ip && !hostsMap.has(ip))
                hostsMap.set(ip, { ip, mac, iface: null });
            }
          }
        }
      }

      const hosts = Array.from(hostsMap.values());

      // Determine LAN hosts relevant to the requested router service dynamically.
      // Strategy:
      // 1) If the router's configured host appears in the ARP table, use its iface
      //    and select other hosts with the same iface.
      // 2) If not found, fallback to prefix matching (strict /24 first, then /16).
      // 3) If no LAN candidates found, return an empty lan list (safer than including multicast).
      const svcIp = host; // the configured service host
      let lanHosts = [];

      if (svcIp) {
        // Try to find a direct ARP entry for the router host to get iface
        const svcEntry = hosts.find((h) => h.ip === svcIp);
        if (svcEntry && svcEntry.iface) {
          lanHosts = hosts.filter(
            (h) => h.iface === svcEntry.iface && isUnicast(h.ip)
          );
        } else {
          // Fallback: try /24 prefix
          const octets = svcIp.split(".");
          if (octets.length === 4) {
            const p24 = `${octets[0]}.${octets[1]}.${octets[2]}.`;
            lanHosts = hosts.filter(
              (h) => String(h.ip).startsWith(p24) && isUnicast(h.ip)
            );
            if (lanHosts.length === 0) {
              // Try /16
              const p16 = `${octets[0]}.${octets[1]}.`;
              lanHosts = hosts.filter(
                (h) => String(h.ip).startsWith(p16) && isUnicast(h.ip)
              );
            }
          }
        }
      }

      // Final fallback: if still empty, return empty LAN list (avoid including multicast/remote nets)
      if (!lanHosts || lanHosts.length === 0) lanHosts = [];

      // Apply pagination to the hosts array
      const paginatedHosts = paginate(hosts, req.pagination);

      // Return both full hosts and lan-specific subset plus a small note about filtering
      res.json({
        count: hosts.length,
        hosts: paginatedHosts.data,
        pagination: paginatedHosts.pagination,
        lan: {
          count: lanHosts.length,
          hosts: lanHosts,
        },
        note: svcIp
          ? lanHosts.length > 0
            ? `Filtered by iface or prefix for ${svcIp}`
            : `No LAN hosts matched for ${svcIp}`
          : "No service host provided",
      });
    } catch (error) {
      logger.error("ARP lookup failed", {
        error: error && error.message ? error.message : String(error),
      });
      res.status(500).json({
        error: "Failed to run ARP lookup",
        message: error && error.message ? error.message : String(error),
      });
    }
  }
);

// Security administration endpoints (require auth + whitelist)
app.get(
  "/api/security/alerts",
  requireAuth,
  requireWhitelistedIP,
  (req, res) => {
    res.status(501).json({
      error: "Security monitoring not implemented",
      message:
        "This endpoint requires security monitoring middleware to be configured",
    });
  }
);

app.get(
  "/api/security/stats",
  requireAuth,
  requireWhitelistedIP,
  (req, res) => {
    res.status(501).json({
      error: "Security monitoring not implemented",
      message:
        "This endpoint requires security monitoring middleware to be configured",
    });
  }
);

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ error: "Not Found" });
});

// Centralized error handler
app.use((err, req, res, next) => {
  logger.error("Unhandled error", {
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal Server Error" });
});

// Graceful shutdown helper
async function handleGracefulShutdown(signal) {
  logger.progress(`Received ${signal || "shutdown"}, shutting down gracefully`);

  // Stop accepting new connections
  try {
    if (httpServerInstance) {
      logger.progress("Closing HTTP server to new connections");
      await new Promise((resolve, reject) => {
        httpServerInstance.close((err) => (err ? reject(err) : resolve()));
        // Force resolve after 10s to avoid hanging
        setTimeout(resolve, 10000);
      });
    }
  } catch (err) {
    logger.warning(
      `Error closing HTTP server: ${err && err.message ? err.message : err}`
    );
  }

  // Shutdown websockets
  try {
    WebSocketManager.shutdown();
  } catch (err) {
    logger.warning(
      `Error shutting down WebSocket manager: ${err && err.message ? err.message : err}`
    );
  }

  // Shutdown services
  try {
    if (serviceManager && typeof serviceManager.shutdown === "function") {
      await serviceManager.shutdown();
    }
  } catch (err) {
    logger.warning(
      `Error shutting down service manager: ${err && err.message ? err.message : err}`
    );
  }

  // Destroy HTTP/HTTPS agents
  try {
    destroyAgents();
  } catch (err) {
    // ignore
  }

  // Shutdown performance monitor
  try {
    if (
      performanceMonitor &&
      typeof performanceMonitor.shutdown === "function"
    ) {
      performanceMonitor.shutdown();
      logger.success("Performance monitor shutdown complete");
    }
  } catch (err) {
    // ignore
  }

  logger.success("Shutdown complete, exiting");
  process.exit(0);
}

// Start server
async function startServer() {
  try {
    await initializeServer();

    httpServerInstance = server.listen(PORT, () => {
      logger.success(`Watchman Backend Server running on port ${PORT}`);
      logger.startup(`Health check: http://localhost:${PORT}/health`);
      logger.startup(`API Documentation: http://localhost:${PORT}/api/docs`);
      logger.startup(
        `Tor Proxy Health: http://localhost:${PORT}/api/tor/proxy/health`
      );
      logger.startup(
        `Services Health: http://localhost:${PORT}/api/services/health`
      );
    });
  } catch (error) {
    logger.error("Failed to start server", { error });
    process.exit(1);
  }
}

startServer();

export default app;
