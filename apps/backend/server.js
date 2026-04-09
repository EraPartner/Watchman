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
import { extractAuthToken } from "./utils/authToken.js";
import { issueCsrfToken, verifyCsrf } from "./middleware/csrf.js";
import {
  checkLockout,
  recordFailedLogin,
  resetLoginAttempts,
} from "./middleware/accountLockout.js";
import { requireBoolean, requireFields } from "./middleware/validation.js";
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
  validateParams,
  validateQuery,
} from "./utils/validation.js";
import { destroyAgents } from "./utils/httpAgentPool.js";
import { registerApiRoutes } from "./routes/registerApiRoutes.js";
import { getRouterArpData } from "./services/RouterArpService.js";

// __esmdirname equivalent for ESM
const __esmdirname = dirname(fileURLToPath(import.meta.url));

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
    join(__esmdirname, "package.json"),
    join(__esmdirname, "..", "package.json"),
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
// Computed after FRONTEND_URL is known so we can handle localhost correctly
const isLocalhostOrigin =
  FRONTEND_URL?.includes("localhost") || FRONTEND_URL?.includes("127.0.0.1");
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production" && !isLocalhostOrigin,
  sameSite: isLocalhostOrigin
    ? "lax"
    : process.env.NODE_ENV === "production"
      ? "strict"
      : "lax",
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
app.use(responseSizeLimit); // Prevent large response DoS attacks
app.use(
  apiResponseStandardizer({
    autoWrap: true,
  })
);

// Serve frontend static files in production
const frontendDist = join(__esmdirname, "frontend", "dist");
if (process.env.NODE_ENV === "production" && fs.existsSync(frontendDist)) {
  logger.info(`Serving frontend from ${frontendDist}`);
  app.use(express.static(frontendDist, { maxAge: "1d" }));
}

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

      // Build allowed origins list: FRONTEND_URL + backend's own origin
      const allowed = [FRONTEND_URL];
      const backendOrigin = `http://localhost:${PORT}`;
      if (!allowed.includes(backendOrigin)) {
        allowed.push(backendOrigin);
      }
      // Also allow the backend's own origin with any host
      try {
        const parsed = new URL(FRONTEND_URL);
        const sameHostBackend = `${parsed.protocol}//${parsed.hostname}:${PORT}`;
        if (!allowed.includes(sameHostBackend)) {
          allowed.push(sameHostBackend);
        }
      } catch (_e) {
        // ignore
      }

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
try {
  const swaggerDocument = YAML.load(
    fs.readFileSync(join(__esmdirname, "api-docs.yaml"), "utf8")
  );

  if (swaggerUi && swaggerUi.serve && swaggerUi.setup) {
    app.use(
      "/api/docs",
      swaggerUi.serve,
      swaggerUi.setup(swaggerDocument, { explorer: true })
    );
  }
} catch (err) {
  logger.warning("Swagger UI not available", { error: err.message });
}

// Apply rate limiting
app.use("/api/", generalLimiter);

const getServiceManager = () => serviceManager;

registerApiRoutes(app, {
  authLimiter,
  checkLockout,
  requireFields,
  authenticateCredentials,
  recordFailedLogin,
  resetLoginAttempts,
  signToken,
  issueCsrfToken,
  requireAuth,
  extractAuthToken,
  verifyToken,
  FRONTEND_URL,
  COOKIE_OPTIONS,
  logger,
  healthLimiter,
  controlLimiter,
  verifyCsrf,
  requireServiceEnabled,
  requireBoolean,
  clearCache,
  validateParams,
  isValidServiceId,
  healthCacheMiddleware,
  statsCacheMiddleware,
  parsePagination,
  paginate,
  sanitizeString,
  cachedConfig,
  getFrontendConfig,
  requireAnyServiceEnabled,
  validateQuery,
  isValidIPv4,
  getRouterArpData,
  requireWhitelistedIP,
  getServiceManager,
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

// API routes are registered via routes/registerApiRoutes.js

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

    // SPA fallback: serve index.html for any non-API route in production
    if (process.env.NODE_ENV === "production" && fs.existsSync(frontendDist)) {
      app.get("*", (req, res) => {
        res.sendFile(join(frontendDist, "index.html"));
      });
    }

    httpServerInstance = server.listen(PORT, () => {
      logger.success(`Watchman Backend Server running on port ${PORT}`);
      logger.startup(`Health check: http://localhost:${PORT}/health`);
      logger.startup(`API Documentation: http://localhost:${PORT}/api/docs`);
      logger.startup(
        `Services Health: http://localhost:${PORT}/api/services/health`
      );
      if (
        process.env.NODE_ENV === "production" &&
        fs.existsSync(frontendDist)
      ) {
        logger.startup(`Frontend: http://localhost:${PORT}`);
      }
    });
  } catch (error) {
    logger.error("Failed to start server", { error });
    process.exit(1);
  }
}

export { startServer };
export default app;
