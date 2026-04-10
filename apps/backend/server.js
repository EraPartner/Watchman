import express from "express";
import cors from "cors";
import helmet from "helmet";
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
  isValidServiceId,
} from "./utils/validation.js";
import { destroyAgents } from "./utils/httpAgentPool.js";
import { registerApiRoutes } from "./routes/registerApiRoutes.js";
import { getRouterArpData } from "./services/RouterArpService.js";
import { envBool, envTrustProxy } from "./utils/env.js";
import { buildAllowedOriginSet, normalizeOrigin } from "./utils/origin.js";
import { configureMiddleware } from "./bootstrap/configureMiddleware.js";
import { registerRoutes } from "./bootstrap/registerRoutes.js";
import {
  attachShutdownHandlers,
  performGracefulShutdown,
} from "./bootstrap/shutdown.js";

const __esmdirname = dirname(fileURLToPath(import.meta.url));

validateEnvironment();

const config = getConfig();
const app = express();
const trustProxy = envTrustProxy("TRUST_PROXY", 1);
const AUTH_RETURN_TOKEN = envBool("AUTH_RETURN_TOKEN", false);
app.set("trust proxy", trustProxy);
const server = createServer(app);
const PORT = config.server.port;
const FRONTEND_URLS = (config.server.frontendUrl || "")
  .split(/[ ,]+/)
  .map((o) => o.trim())
  .filter(Boolean);
const FRONTEND_URL = FRONTEND_URLS[0] || config.server.frontendUrl;
const FRONTEND_ORIGINS = [...buildAllowedOriginSet(FRONTEND_URLS)];
const ALLOWED_CORS_ORIGINS = new Set(FRONTEND_ORIGINS);
for (const frontendOrigin of FRONTEND_ORIGINS) {
  try {
    const parsed = new URL(frontendOrigin);
    ALLOWED_CORS_ORIGINS.add(`${parsed.protocol}//${parsed.hostname}:${PORT}`);
  } catch (_error) {
    // ignore malformed configured origins
  }
}
ALLOWED_CORS_ORIGINS.add(`http://localhost:${PORT}`);
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
          return hostname && hostname.includes(".") ? hostname : null;
        } catch (_err) {
          return null;
        }
      })();
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

if (process.env.NODE_ENV === "production") {
  if (FRONTEND_URLS.length === 0) {
    logger.error(
      "FRONTEND_URL must be set to your frontend origin(s) in production to avoid open CORS."
    );
    process.exit(1);
  }

  const nonHttpsOrigins = FRONTEND_URLS.filter(
    (url) => !url.startsWith("https://")
  );
  if (nonHttpsOrigins.length > 0) {
    logger.warning(
      "All FRONTEND_URL origins should use HTTPS in production for security"
    );
  }

  if (!config.auth.jwtSecret || config.auth.jwtSecret.length < 32) {
    logger.error(
      "JWT_SECRET must be at least 32 characters long in production"
    );
    process.exit(1);
  }
}

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

const frontendDist = join(__esmdirname, "frontend", "dist");

let serviceManager;
let httpServerInstance = null;

function handleGracefulShutdown(signal) {
  return performGracefulShutdown(signal, {
    logger,
    httpServerInstance,
    WebSocketManager,
    serviceManager,
    destroyAgents,
    performanceMonitor,
  });
}

attachShutdownHandlers({ logger, handleGracefulShutdown });

async function initializeServer() {
  logger.startup("Initializing Watchman Backend Server");
  logger.startup(`Environment: ${process.env.NODE_ENV || "development"}`);
  logger.startup(`Frontend URL: ${FRONTEND_URL}`);
  logger.startup(`Port: ${PORT}`);
  logger.startup(`Trust proxy: ${String(trustProxy)}`);

  if (AUTH_RETURN_TOKEN) {
    logger.warning(
      "AUTH_RETURN_TOKEN is enabled. Login responses will include a JWT token for compatibility. Disable this in production for stronger XSS resistance."
    );
  }

  try {
    serviceManager = new ServiceManager();
    await serviceManager.initializeServices();

    WebSocketManager.initialize(server);

    logger.success("Service initialization complete");
  } catch (error) {
    logger.error("Failed to initialize services", { error });
    process.exit(1);
  }
}

configureMiddleware(app, {
  requestIdMiddleware,
  requestLogger,
  performanceMonitor,
  enforceIPControl,
  requestTimeout,
  responseSizeLimit,
  apiResponseStandardizer,
  frontendDist,
  logger,
  helmet,
  FRONTEND_URL,
  cors,
  normalizeOrigin,
  ALLOWED_CORS_ORIGINS,
  cookieParser,
  swaggerUi,
  YAML,
  fs,
  join,
  __esmdirname,
  generalLimiter,
});

const getServiceManager = () => serviceManager;

registerRoutes(app, {
  healthLimiter,
  APP_VERSION,
  registerApiRoutes,
  apiRouteDeps: {
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
    COOKIE_OPTIONS,
    AUTH_RETURN_TOKEN,
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
  },
  logger,
  frontendDist,
  fs,
  join,
});

async function startServer() {
  try {
    await initializeServer();

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
