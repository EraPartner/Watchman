import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import dotenv from "dotenv";
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
import { exec as execCb } from "child_process";
import { promisify } from "util";
import { getConfig, validateEnvironment } from "./config.js";
import logger, {
  requestIdMiddleware,
  requestLogger,
} from "./middleware/logger.js";
import { requireWhitelistedIP } from "./middleware/ipControl.js";
import {
  requireAnyServiceEnabled,
  requireServiceEnabled,
} from "./middleware/serviceEnabled.js";

const exec = promisify(execCb);

// Load environment variables
// Support both dev (server.js) and production (dist/server.js) paths
// Suppress verbose dotenv output
process.env.DOTENV_QUIET = "true";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, ".env.local");
const envPathParent = join(__dirname, "..", ".env.local");

// Try current directory first, then parent directory (for dist builds)
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else if (fs.existsSync(envPathParent)) {
  dotenv.config({ path: envPathParent });
} else {
  dotenv.config({ path: ".env.local" });
}

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
          return FRONTEND_URL ? new URL(FRONTEND_URL).hostname : null;
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
  secure: process.env.NODE_ENV === "production" ? FRONTEND_HTTPS : false,
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
    console.error("💥 Uncaught Exception:", error);
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
    console.error("💥 Unhandled Rejection:", reason);
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
  res.setHeader("X-Request-ID", req.id || "unknown");
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
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "watchman-backend",
    version: "1.0.0",
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
      console.error(
        `❌ Service ${req.params.serviceId} status failed:`,
        error.message
      );
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
      console.error(
        `❌ Service ${req.params.serviceId} stats failed:`,
        error.message
      );
      res.status(500).json({
        error: `Failed to fetch ${req.params.serviceId} stats`,
        message: error.message,
      });
    }
  }
);

// Specific service endpoints (kept for backward compatibility with hardcoded service names)
// AdGuard API endpoints - status and stats (re-added)
app.get(
  "/api/adguard/status",
  healthLimiter,
  requireServiceEnabled("adguard"),
  healthCacheMiddleware,
  async (req, res) => {
    try {
      const adguardService = serviceManager.getService("adguard");
      if (!adguardService) {
        return res.status(503).json({
          error: "AdGuard service not configured",
          status: "offline",
        });
      }

      const health = await serviceManager.getServiceHealth("adguard");
      logger.debug("AdGuard status connection successful");
      res.json(health);
    } catch (error) {
      logger.error("AdGuard status connection failed", {
        error: error.message,
      });
      res.status(500).json({
        error: "Failed to fetch AdGuard status",
        status: "offline",
        message: error.message,
      });
    }
  }
);

app.get(
  "/api/adguard/stats",
  requireAuth, // Add authentication requirement
  requireServiceEnabled("adguard"),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const adguardService = serviceManager.getService("adguard");
      if (!adguardService) {
        return res
          .status(503)
          .json({ error: "AdGuard service not configured" });
      }

      const stats = await serviceManager.getServiceStats("adguard");
      logger.info("[SUCCESS] AdGuard stats connection successful");
      res.json(stats);
    } catch (error) {
      logger.error("AdGuard stats connection failed", { error: error.message });
      res.status(500).json({
        error: "Failed to fetch AdGuard stats",
        message: error.message,
      });
    }
  }
);

// AdGuard update check endpoint
app.get(
  "/api/adguard/updates",
  requireServiceEnabled("adguard"),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const adguardService = serviceManager.getService("adguard");
      if (!adguardService) {
        return res
          .status(503)
          .json({ error: "AdGuard service not configured" });
      }

      const updateInfo = await adguardService.checkForUpdates();
      res.json(updateInfo);
    } catch (error) {
      logger.error("AdGuard update check failed", { error: error.message });
      res.status(500).json({
        error: "Failed to check for AdGuard updates",
        message: error.message,
      });
    }
  }
);

// Bitcoin API endpoints
app.get(
  "/api/bitcoin/health",
  healthLimiter,
  requireServiceEnabled("bitcoin"),
  healthCacheMiddleware,
  async (req, res) => {
    try {
      const bitcoinService = serviceManager.getService("bitcoin");
      if (!bitcoinService) {
        return res.status(503).json({
          error: "Bitcoin service not configured",
          status: "offline",
        });
      }

      const health = await serviceManager.getServiceHealth("bitcoin");
      logger.info("[SUCCESS] Bitcoin health connection successful");
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

app.get(
  "/api/bitcoin/status",
  healthLimiter,
  requireServiceEnabled("bitcoin"),
  healthCacheMiddleware,
  async (req, res) => {
    try {
      const bitcoinService = serviceManager.getService("bitcoin");
      if (!bitcoinService) {
        return res.status(503).json({
          error: "Bitcoin service not configured",
          status: "offline",
        });
      }

      const health = await serviceManager.getServiceHealth("bitcoin");
      logger.info("[SUCCESS] Bitcoin status connection successful");
      res.json(health);
    } catch (error) {
      logger.error("Bitcoin status connection failed", {
        error: error.message,
      });
      res.status(500).json({
        error: "Failed to fetch Bitcoin status",
        status: "offline",
        message: error.message,
      });
    }
  }
);

app.get(
  "/api/bitcoin/stats",
  requireServiceEnabled("bitcoin"),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const bitcoinService = serviceManager.getService("bitcoin");
      if (!bitcoinService) {
        return res
          .status(503)
          .json({ error: "Bitcoin service not configured" });
      }

      const stats = await serviceManager.getServiceStats("bitcoin");
      logger.debug("Bitcoin stats connection successful");
      res.json(stats);
    } catch (error) {
      logger.error("Bitcoin stats connection failed", { error: error.message });
      res.status(500).json({
        error: "Failed to fetch Bitcoin stats",
        message: error.message,
      });
    }
  }
);

// Bitcoin update check endpoint
app.get(
  "/api/bitcoin/updates",
  requireServiceEnabled("bitcoin"),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const bitcoinService = serviceManager.getService("bitcoin");
      if (!bitcoinService) {
        return res
          .status(503)
          .json({ error: "Bitcoin service not configured" });
      }

      const updateInfo = await bitcoinService.checkForUpdates();
      res.json(updateInfo);
    } catch (error) {
      console.error("❌ Bitcoin update check failed:", error.message);
      res.status(500).json({
        error: "Failed to check for Bitcoin updates",
        message: error.message,
      });
    }
  }
);

// qBittorrent API endpoints
app.get(
  "/api/qbittorrent/status",
  healthLimiter,
  requireServiceEnabled("qbittorrent"),
  healthCacheMiddleware,
  async (req, res) => {
    try {
      const qbittorrentService = serviceManager.getService("qbittorrent");
      if (!qbittorrentService) {
        return res.status(503).json({
          error: "qBittorrent service not configured",
          status: "offline",
        });
      }

      const health = await serviceManager.getServiceHealth("qbittorrent");
      logger.info("[SUCCESS] qBittorrent status connection successful");
      res.json(health);
    } catch (error) {
      logger.error("qBittorrent status connection failed", {
        error: error.message,
      });
      res.status(500).json({
        error: "Failed to fetch qBittorrent status",
        status: "offline",
        message: error.message,
      });
    }
  }
);

app.get(
  "/api/qbittorrent/stats",
  requireServiceEnabled("qbittorrent"),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const qbittorrentService = serviceManager.getService("qbittorrent");
      if (!qbittorrentService) {
        return res
          .status(503)
          .json({ error: "qBittorrent service not configured" });
      }

      const stats = await serviceManager.getServiceStats("qbittorrent");
      logger.info("[SUCCESS] qBittorrent stats connection successful");
      res.json(stats);
    } catch (error) {
      logger.error("qBittorrent stats connection failed", {
        error: error.message,
      });
      res.status(500).json({
        error: "Failed to fetch qBittorrent stats",
        message: error.message,
      });
    }
  }
);

// IPFS API endpoints
app.get(
  "/api/ipfs/status",
  healthLimiter,
  requireServiceEnabled("ipfs"),
  healthCacheMiddleware,
  async (req, res) => {
    try {
      const ipfsService = serviceManager.getService("ipfs");
      if (!ipfsService) {
        return res
          .status(503)
          .json({ error: "IPFS service not configured", status: "offline" });
      }

      const health = await serviceManager.getServiceHealth("ipfs");
      logger.info("[SUCCESS] IPFS status connection successful");
      res.json(health);
    } catch (error) {
      logger.error("IPFS status connection failed", { error: error.message });
      res.status(500).json({
        error: "Failed to fetch IPFS status",
        status: "offline",
        message: error.message,
      });
    }
  }
);

app.get(
  "/api/ipfs/stats",
  requireServiceEnabled("ipfs"),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const ipfsService = serviceManager.getService("ipfs");
      if (!ipfsService) {
        return res.status(503).json({ error: "IPFS service not configured" });
      }

      const stats = await serviceManager.getServiceStats("ipfs");
      logger.info("[SUCCESS] IPFS stats connection successful");
      res.json(stats);
    } catch (error) {
      logger.error("IPFS stats connection failed", { error: error.message });
      res.status(500).json({
        error: "Failed to fetch IPFS stats",
        message: error.message,
      });
    }
  }
);

// IPFS update check endpoint
app.get(
  "/api/ipfs/updates",
  requireAuth,
  requireServiceEnabled("ipfs"),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const ipfsService = serviceManager.getService("ipfs");
      if (!ipfsService) {
        return res.status(503).json({ error: "IPFS service not configured" });
      }

      const updateInfo = await ipfsService.checkForUpdates();
      res.json(updateInfo);
    } catch (error) {
      console.error("❌ IPFS update check failed:", error.message);
      res.status(500).json({
        error: "Failed to check for IPFS updates",
        message: error.message,
      });
    }
  }
);

// Roon (ROCK) API endpoints
app.get(
  "/api/roon/status",
  healthLimiter,
  requireServiceEnabled("roon"),
  healthCacheMiddleware,
  async (req, res) => {
    try {
      const roonService = serviceManager.getService("roon");
      if (!roonService) {
        return res.status(503).json({ error: "Roon service not configured" });
      }

      const health = await serviceManager.getServiceHealth("roon");
      console.log(`✅ Roon status connection successful`);
      res.json(health);
    } catch (error) {
      console.error("❌ Roon status connection failed:", error.message);
      res.status(500).json({
        error: "Failed to fetch Roon status",
        status: "offline",
        message: error.message,
      });
    }
  }
);

app.get(
  "/api/roon/stats",
  requireServiceEnabled("roon"),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const roonService = serviceManager.getService("roon");
      if (!roonService) {
        return res.status(503).json({ error: "Roon service not configured" });
      }

      const stats = await serviceManager.getServiceStats("roon");
      console.log(`✅ Roon stats connection successful`);
      res.json(stats);
    } catch (error) {
      console.error("❌ Roon stats connection failed:", error.message);
      res.status(500).json({
        error: "Failed to fetch Roon stats",
        message: error.message,
      });
    }
  }
);

// Tor API endpoints
app.get(
  "/api/tor/relay/:nickname?",
  requireServiceEnabled("tor"),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const torService = serviceManager.getService("tor");
      if (!torService) {
        return res.status(503).json({ error: "Tor service not configured" });
      }

      const stats = await serviceManager.getServiceStats("tor");
      logger.info("Tor relay connection successful");
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

app.get(
  "/api/tor/health",
  healthLimiter,
  requireServiceEnabled("tor"),
  healthCacheMiddleware,
  async (req, res) => {
    try {
      const torService = serviceManager.getService("tor");
      if (!torService) {
        return res.status(503).json({ error: "Tor service not configured" });
      }

      const health = await serviceManager.getServiceHealth("tor");
      console.log(`✅ Tor health check connection successful`);
      res.json(health);
    } catch (error) {
      console.error("❌ Tor health check connection failed:", error.message);
      res.status(500).json({
        error: "Failed to check Tor health",
        message: error.message,
      });
    }
  }
);

// Tor update check endpoint
app.get(
  "/api/tor/updates",
  requireServiceEnabled("tor"),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const torService = serviceManager.getService("tor");
      if (!torService) {
        return res.status(503).json({ error: "Tor service not configured" });
      }

      const updateInfo = await torService.checkForUpdates();
      res.json(updateInfo);
    } catch (error) {
      console.error("❌ Tor update check failed:", error.message);
      res.status(500).json({
        error: "Failed to check for Tor updates",
        message: error.message,
      });
    }
  }
);

// Synology NAS API endpoints
app.get(
  "/api/synology/status",
  healthLimiter,
  requireServiceEnabled("synology"),
  healthCacheMiddleware,
  async (req, res) => {
    try {
      const synologyService = serviceManager.getService("synology");
      if (!synologyService) {
        return res.status(503).json({
          error: "Synology service not configured",
          status: "offline",
        });
      }

      const health = await serviceManager.getServiceHealth("synology");
      console.log(`✅ Synology status connection successful`);
      res.json(health);
    } catch (error) {
      console.error("❌ Synology status connection failed:", error.message);
      res.status(500).json({
        error: "Failed to fetch Synology status",
        status: "offline",
        message: error.message,
      });
    }
  }
);

app.get(
  "/api/synology/stats",
  requireServiceEnabled("synology"),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const synologyService = serviceManager.getService("synology");
      if (!synologyService) {
        return res
          .status(503)
          .json({ error: "Synology service not configured" });
      }

      const stats = await serviceManager.getServiceStats("synology");

      // Ensure we always return valid JSON
      if (stats === null || stats === undefined) {
        return res.status(500).json({
          error: "Synology stats returned null or undefined",
          status: "error",
          timestamp: new Date().toISOString(),
        });
      }

      console.log(`✅ Synology stats connection successful`);
      res.json(stats);
    } catch (error) {
      console.error("❌ Synology stats connection failed:", error.message);
      res.status(500).json({
        error: "Failed to fetch Synology stats",
        message: error.message,
        status: "error",
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// Philips Bridge endpoints
app.get(
  "/api/philips/status",
  healthLimiter,
  requireServiceEnabled("philips"),
  healthCacheMiddleware,
  async (req, res) => {
    try {
      const philipsService = serviceManager.getService("philips");
      if (!philipsService) {
        return res.status(503).json({
          error: "Philips Bridge service not configured",
          status: "offline",
        });
      }

      const health = await serviceManager.getServiceHealth("philips");
      console.log(`✅ Philips Bridge status connection successful`);
      res.json(health);
    } catch (error) {
      console.error(
        "❌ Philips Bridge status connection failed:",
        error.message
      );
      res.status(500).json({
        error: "Failed to fetch Philips Bridge status",
        status: "offline",
        message: error.message,
      });
    }
  }
);

app.get(
  "/api/philips/stats",
  requireServiceEnabled("philips"),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const philipsService = serviceManager.getService("philips");
      if (!philipsService) {
        return res
          .status(503)
          .json({ error: "Philips Bridge service not configured" });
      }

      const stats = await serviceManager.getServiceStats("philips");
      console.log(`✅ Philips Bridge stats connection successful`);
      res.json(stats);
    } catch (error) {
      console.error(
        "❌ Philips Bridge stats connection failed:",
        error.message
      );
      res.status(500).json({
        error: "Failed to fetch Philips Bridge stats",
        message: error.message,
      });
    }
  }
);

// New status endpoints under /api/status/* to match requested API shape (only allowed endpoints)
app.get(
  "/api/status/homebridge-version",
  requireServiceEnabled("homebridge"),
  statsCacheMiddleware,
  requireAuth,
  async (req, res) => {
    try {
      const hbService = serviceManager.getService("homebridge");
      if (!hbService) {
        return res
          .status(503)
          .json({ error: "Homebridge service not configured" });
      }

      // Directly call the service-specific method if available
      if (typeof hbService.getVersion === "function") {
        const ver = await hbService.getVersion();
        return res.json(ver);
      }

      // Fallback to stats
      const stats = await hbService.getStats();
      res.json({
        version: stats?.data?.version || stats?.version || null,
        raw: stats,
      });
    } catch (error) {
      console.error("❌ /api/status/homebridge-version failed:", error.message);
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
      const hbService = serviceManager.getService("homebridge");
      if (!hbService) {
        return res
          .status(503)
          .json({ error: "Homebridge service not configured" });
      }

      if (typeof hbService.getServerInformation === "function") {
        const info = await hbService.getServerInformation();
        return res.json(info);
      }

      // Fallback to health/status
      const health = await serviceManager.getServiceHealth("homebridge");
      res.json({
        data: health && health.data ? health.data : null,
        raw: health,
      });
    } catch (error) {
      console.error("❌ /api/status/server-information failed:", error.message);
      res.status(500).json({
        error: "Failed to fetch server information",
        message: error.message,
      });
    }
  }
);

// Homebridge endpoints
app.get(
  "/api/homebridge/status",
  healthLimiter,
  requireServiceEnabled("homebridge"),
  healthCacheMiddleware,
  async (req, res) => {
    try {
      const hbService = serviceManager.getService("homebridge");
      if (!hbService) {
        return res.status(503).json({
          error: "Homebridge service not configured",
          status: "offline",
        });
      }

      const health = await serviceManager.getServiceHealth("homebridge");
      console.log("✅ Homebridge status connection successful");
      res.json(health);
    } catch (error) {
      console.error("❌ Homebridge status connection failed:", error.message);
      res.status(500).json({
        error: "Failed to fetch Homebridge status",
        status: "offline",
        message: error.message,
      });
    }
  }
);

app.get(
  "/api/homebridge/stats",
  requireServiceEnabled("homebridge"),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const hbService = serviceManager.getService("homebridge");
      if (!hbService) {
        return res
          .status(503)
          .json({ error: "Homebridge service not configured" });
      }

      const stats = await serviceManager.getServiceStats("homebridge");
      console.log("✅ Homebridge stats connection successful");
      res.json(stats);
    } catch (error) {
      console.error("❌ Homebridge stats connection failed:", error.message);
      res.status(500).json({
        error: "Failed to fetch Homebridge stats",
        message: error.message,
      });
    }
  }
);

// Homebridge update check endpoint
app.get(
  "/api/homebridge/updates",
  requireServiceEnabled("homebridge"),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const hbService = serviceManager.getService("homebridge");
      if (!hbService) {
        return res
          .status(503)
          .json({ error: "Homebridge service not configured" });
      }

      const updateInfo = await hbService.checkForUpdates();
      res.json(updateInfo);
    } catch (error) {
      console.error("❌ Homebridge update check failed:", error.message);
      res.status(500).json({
        error: "Failed to check for Homebridge updates",
        message: error.message,
      });
    }
  }
);

// New: expose accessories endpoint
app.get(
  "/api/accessories",
  requireServiceEnabled("homebridge"),
  statsCacheMiddleware,
  requireAuth,
  async (req, res) => {
    try {
      const hbService = serviceManager.getService("homebridge");
      if (!hbService) {
        return res
          .status(503)
          .json({ error: "Homebridge service not configured" });
      }

      if (typeof hbService.getAccessories === "function") {
        const accessories = await hbService.getAccessories();
        return res.json(accessories);
      }

      // Fallback: try to use getStats or getServerInformation if accessories not available
      res.status(501).json({
        error:
          "Accessories endpoint not implemented for this Homebridge service",
      });
    } catch (error) {
      console.error("❌ /api/accessories failed:", error.message);
      res
        .status(500)
        .json({ error: "Failed to fetch accessories", message: error.message });
    }
  }
);

// Alby Hub endpoints
app.get(
  "/api/albyhub/status",
  healthLimiter,
  requireServiceEnabled("albyhub"),
  healthCacheMiddleware,
  async (req, res) => {
    try {
      const albyService = serviceManager.getService("albyhub");
      if (!albyService) {
        return res.status(503).json({
          error: "Alby Hub service not configured",
          status: "offline",
        });
      }

      const health = await serviceManager.getServiceHealth("albyhub");
      console.log(`✅ Alby Hub status connection successful`);
      res.json(health);
    } catch (error) {
      console.error("❌ Alby Hub status connection failed:", error.message);
      res.status(500).json({
        error: "Failed to fetch Alby Hub status",
        status: "offline",
        message: error.message,
      });
    }
  }
);

app.get(
  "/api/albyhub/stats",
  requireServiceEnabled("albyhub"),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const albyService = serviceManager.getService("albyhub");
      if (!albyService) {
        return res
          .status(503)
          .json({ error: "Alby Hub service not configured" });
      }

      const stats = await serviceManager.getServiceStats("albyhub");
      console.log(`✅ Alby Hub stats connection successful`);
      res.json(stats);
    } catch (error) {
      console.error("❌ Alby Hub stats connection failed:", error.message);
      res.status(500).json({
        error: "Failed to fetch Alby Hub stats",
        message: error.message,
      });
    }
  }
);

// Mac Mini endpoints: status and stats
app.get(
  "/api/macmini/status",
  healthLimiter,
  requireServiceEnabled("macmini"),
  healthCacheMiddleware,
  async (req, res) => {
    try {
      const macService = serviceManager.getService("macmini");
      if (!macService) {
        return res.status(503).json({
          error: "Mac Mini service not configured",
          status: "offline",
        });
      }

      const health = await serviceManager.getServiceHealth("macmini");
      console.log("✅ Mac Mini status connection successful");
      res.json(health);
    } catch (error) {
      console.error("❌ Mac Mini status connection failed:", error.message);
      res.status(500).json({
        error: "Failed to fetch Mac Mini status",
        status: "offline",
        message: error.message,
      });
    }
  }
);

app.get(
  "/api/macmini/stats",
  requireServiceEnabled("macmini"),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const macService = serviceManager.getService("macmini");
      if (!macService) {
        return res
          .status(503)
          .json({ error: "Mac Mini service not configured" });
      }

      const stats = await serviceManager.getServiceStats("macmini");
      console.log("✅ Mac Mini stats connection successful");
      res.json(stats);
    } catch (error) {
      console.error("❌ Mac Mini stats connection failed:", error.message);
      res.status(500).json({
        error: "Failed to fetch Mac Mini stats",
        message: error.message,
      });
    }
  }
);

// Raspberry Pi endpoints
app.get(
  "/api/raspi/status",
  healthLimiter,
  requireServiceEnabled("raspi"),
  healthCacheMiddleware,
  async (req, res) => {
    try {
      const raspiService = serviceManager.getService("raspi");
      if (!raspiService) {
        return res.status(503).json({
          error: "Raspberry Pi service not configured",
          status: "offline",
        });
      }

      const health = await serviceManager.getServiceHealth("raspi");
      console.log("✅ Raspberry Pi status connection successful");
      res.json(health);
    } catch (error) {
      console.error("❌ Raspberry Pi status connection failed:", error.message);
      res.status(500).json({
        error: "Failed to fetch Raspberry Pi status",
        status: "offline",
        message: error.message,
      });
    }
  }
);

app.get(
  "/api/raspi/stats",
  requireServiceEnabled("raspi"),
  statsCacheMiddleware,
  async (req, res) => {
    try {
      const raspiService = serviceManager.getService("raspi");
      if (!raspiService) {
        return res
          .status(503)
          .json({ error: "Raspberry Pi service not configured" });
      }

      const stats = await serviceManager.getServiceStats("raspi");
      console.log("✅ Raspberry Pi stats connection successful");
      res.json(stats);
    } catch (error) {
      console.error("❌ Raspberry Pi stats connection failed:", error.message);
      res.status(500).json({
        error: "Failed to fetch Raspberry Pi stats",
        message: error.message,
      });
    }
  }
);

// Get health of all enabled services - REQUIRES AUTHENTICATION
app.get(
  "/api/services/health",
  healthLimiter,
  requireAuth,
  async (req, res) => {
    try {
      const config = getConfig();
      const enabledServices = config.enabledServices;

      // Only check health for enabled services
      const healthResults = {};

      for (const serviceName of enabledServices) {
        try {
          healthResults[serviceName] =
            await serviceManager.getServiceHealth(serviceName);
        } catch (error) {
          healthResults[serviceName] = {
            status: "offline",
            error: error.message,
            timestamp: new Date().toISOString(),
          };
        }
      }

      res.json({
        services: healthResults,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Services health check failed:", error.message);
      res.status(500).json({
        error: "Failed to check services health",
        message: error.message,
      });
    }
  }
);

// Frontend configuration endpoint
app.get("/api/config/frontend", (req, res) => {
  const enabledServices = config.enabledServices;

  // Debug logging
  logger.debug("Frontend config requested");
  logger.debug("Enabled services", {
    enabledServices: Array.from(enabledServices),
  });
  logger.debug("ENABLED_SERVICES env", { value: process.env.ENABLED_SERVICES });

  res.json({
    enabledServices: Array.from(enabledServices),
    services: {
      adguard: {
        webUrl: process.env.ADGUARD_MAIN_URL || "http://127.0.0.1:5213",
      },
      ipfs: (() => {
        const url = process.env.IPFS_API_URL || "";
        let host = null;
        let port = null;
        try {
          if (url && url.trim()) {
            const parsed = new URL(url);
            host = parsed.hostname || null;
            port = parsed.port || null;
          }
        } catch (e) {
          // ignore parse errors
        }

        host = host || process.env.IPFS_HOST || null;
        port = port || process.env.IPFS_PORT || null;

        // If the user runs an IPFS web UI, expose a clickable webUrl env var
        const webUiUrl = process.env.IPFS_WEB_UI_URL || null;

        return {
          host,
          port,
          webUrl: webUiUrl,
          configured: !!(host || webUiUrl || process.env.IPFS_API_URL),
        };
      })(),
      tor: {
        nickname: process.env.TOR_RELAY_NICKNAME,
        ip: process.env.TOR_RELAY_IP || process.env.DEFAULT_IP || "127.0.0.1",
        port: process.env.TOR_DEFAULT_PORT || 27801,
        metricsUrl:
          process.env.TOR_METRICS_URL || "https://metrics.torproject.org",
      },
      bitcoin: {
        onionUrl: process.env.BITCOIN_ONION_URL,
        rpcPort: process.env.BITCOIN_RPC_PORT || 8332,
        configured: !!(
          process.env.BITCOIN_ONION_URL &&
          process.env.BITCOIN_RPC_USER &&
          process.env.BITCOIN_RPC_AUTH
        ),
      },
      roon: {
        host: process.env.ROON_HOST || null,
        ports: process.env.ROON_PORTS || process.env.ROON_DEFAULT_PORT || null,
        configured: !!process.env.ROON_HOST,
      },
      qbittorrent: (() => {
        // Try to parse host/port from QBITTORRENT_URL if present
        const url = process.env.QBITTORRENT_URL || "";
        let host = null;
        let port =
          process.env.QBITTORRENT_PORT ||
          process.env.QBITTORRENT_WEB_PORT ||
          null;
        try {
          if (url && url.trim()) {
            const parsed = new URL(url);
            host = parsed.hostname || null;
            if (parsed.port) port = parsed.port;
          }
        } catch (e) {
          // ignore parse errors
        }

        // Fallback to individual host env var if provided
        host = host || process.env.QBITTORRENT_HOST || null;
        port = port || null;

        return {
          host,
          webPort: port,
          configured: !!host,
        };
      })(),
      synology: {
        host: process.env.SYNOLOGY_HOST || null,
        webPort:
          process.env.SYNOLOGY_WEB_PORT ||
          process.env.SYNOLOGY_HTTP_PORT ||
          process.env.SYNOLOGY_PORT ||
          5000,
        configured: !!process.env.SYNOLOGY_HOST,
      },
      albyhub: {
        // Provide the raw ALBYHUB_URL so the frontend can construct a clickable host:port link
        url: process.env.ALBYHUB_URL || null,
        configured: !!process.env.ALBYHUB_URL,
      },
      nostrcheck: {
        relayUrl: process.env.NOSTRCHECK_RELAY_URL || null,
        // Expose an optional clickable web UI URL (http(s)://...) for the relay
        webUrl: process.env.NOSTRCHECK_WEB_URL || null,
        enabled:
          (process.env.NOSTRCHECK_ENABLED || "false").toLowerCase() === "true",
        configured: !!process.env.NOSTRCHECK_RELAY_URL,
      },
      // Expose configured routers (BERYL/TELENET) so frontend can show host/ports
      beryl: {
        host: process.env.BERYL_HOST || null,
        ports: process.env.BERYL_PORTS
          ? String(process.env.BERYL_PORTS)
              .split(/[ ,]+/)
              .map((p) => Number(p))
              .filter(Boolean)
          : [],
        configured: !!process.env.BERYL_HOST,
        // If a non-default web port is configured, expose a clickable webUrl so frontend links include the port
        webUrl: (() => {
          const h = process.env.BERYL_HOST;
          const portsRaw = process.env.BERYL_PORTS || "";
          if (!h) return null;
          const ports = portsRaw
            .split(/[ ,]+/)
            .map((p) => Number(p))
            .filter(Boolean);
          // prefer a single explicit web port if provided; fallback to port 80
          const webPort = ports.length > 0 ? ports[0] : null;
          // Prefer https first. If webPort is present and non-standard, include it.
          const preferHttps =
            (process.env.BERYL_PREFER_HTTPS || "true").toLowerCase() !==
            "false";
          if (preferHttps) {
            if (webPort && webPort !== 443) return `https://${h}:${webPort}`;
            return `https://${h}`;
          }
          // Fallback to http
          if (webPort && webPort !== 80) return `http://${h}:${webPort}`;
          return `http://${h}`;
        })(),
      },
      telenet: {
        host: process.env.TELENET_HOST || null,
        ports: process.env.TELENET_PORTS
          ? String(process.env.TELENET_PORTS)
              .split(/[ ,]+/)
              .map((p) => Number(p))
              .filter(Boolean)
          : [],
        configured: !!process.env.TELENET_HOST,
      },
    },
    app: {
      name: "Watchman Dashboard",
      version: "1.0.0",
    },
  });
});

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
    console.error("❌ Failed to get service instances:", error.message);
    res.status(500).json({
      error: "Failed to get service instances",
      message: error.message,
    });
  }
});

// Route: ARP / neighbor lookup for router services
// Returns: { count: number, hosts: Array<{ ip: string, mac?: string, iface?: string }> , raw?: string }
app.get(
  "/api/router/arp",
  healthLimiter,
  requireAnyServiceEnabled("beryl", "telenet"),
  async (req, res) => {
    try {
      const serviceName =
        typeof req.query.service === "string" ? req.query.service : null;
      if (!serviceName)
        return res
          .status(400)
          .json({ error: "Missing service query param (e.g. ?service=beryl)" });

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

      // Choose platform-appropriate command
      const platform = process.platform;
      const cmd = platform === "linux" ? "ip neigh" : "arp -a";

      // Execute with a short timeout
      const { stdout } = await exec(cmd, { timeout: 5000 }).catch((err) => ({
        stdout: err && err.stdout ? String(err.stdout) : "",
      }));
      const out = String(stdout || "");

      const hostsMap = new Map();

      if (platform === "linux") {
        // Parse `ip neigh` lines like: "192.168.1.10 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE"
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
        // ? (192.168.1.5) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]
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
            // Fallback: try to extract e.g. "hostname (192.168.1.2) at ..."
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

      // Exclude multicast and link-local addresses helper
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

      // Return both full hosts and lan-specific subset plus a small note about filtering
      res.json({
        count: hosts.length,
        hosts,
        lan: {
          count: lanHosts.length,
          hosts: lanHosts,
        },
        note: svcIp
          ? lanHosts.length > 0
            ? `Filtered by iface or prefix for ${svcIp}`
            : `No LAN hosts matched for ${svcIp}`
          : "No service host provided",
        raw: out.substring(0, 10000),
      });
    } catch (error) {
      console.error(
        "❌ ARP lookup failed:",
        error && error.message ? error.message : error
      );
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
    try {
      res.status(501).json({
        error: "Security monitoring not implemented",
        message:
          "This endpoint requires security monitoring middleware to be configured",
      });
    } catch (error) {
      logger.error("Failed to retrieve security alerts", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to retrieve alerts" });
    }
  }
);

app.get(
  "/api/security/stats",
  requireAuth,
  requireWhitelistedIP,
  (req, res) => {
    try {
      res.status(501).json({
        error: "Security monitoring not implemented",
        message:
          "This endpoint requires security monitoring middleware to be configured",
      });
    } catch (error) {
      logger.error("Failed to retrieve security stats", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to retrieve stats" });
    }
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
