import { createServiceRoutes, createUpdatesRoute } from "./serviceFactory.js";
import { registerAuthRoutes } from "./authRoutes.js";
import { registerControlRoutes } from "./controlRoutes.js";
import { registerHomebridgeRoutes } from "./homebridgeRoutes.js";
import { registerInstanceServiceRoutes } from "./instanceRoutes.js";
import { registerMetaRoutes } from "./metaRoutes.js";
import { registerRouterRoutes } from "./routerRoutes.js";
import { registerSecurityRoutes } from "./securityRoutes.js";
import { registerServiceAliasRoutes } from "./serviceAliasRoutes.js";

const STANDARD_SERVICE_ROUTES = [
  "adguard",
  "qbittorrent",
  "ipfs",
  "roon",
  "synology",
  "philips",
  "albyhub",
  "macmini",
  "raspi",
  "bitcoin",
  "tor",
  "homebridge",
];

const UPDATE_SERVICE_ROUTES = ["adguard", "bitcoin", "tor", "homebridge"];

export function registerApiRoutes(app, deps) {
  const {
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
  } = deps;

  registerAuthRoutes(app, {
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
  });

  registerControlRoutes(app, {
    controlLimiter,
    requireAuth,
    verifyCsrf,
    requireServiceEnabled,
    requireBoolean,
    clearCache,
    getServiceManager,
    logger,
  });

  const factoryMiddleware = {
    healthLimiter,
    requireServiceEnabled,
    requireAuth,
    healthCacheMiddleware,
    statsCacheMiddleware,
  };

  registerInstanceServiceRoutes(app, {
    healthLimiter,
    validateParams,
    isValidServiceId,
    healthCacheMiddleware,
    requireAuth,
    statsCacheMiddleware,
    getServiceManager,
    logger,
  });

  for (const svc of STANDARD_SERVICE_ROUTES) {
    app.use(
      `/api/${svc}`,
      createServiceRoutes(svc, getServiceManager, factoryMiddleware)
    );
  }

  registerHomebridgeRoutes(app, {
    requireServiceEnabled,
    statsCacheMiddleware,
    requireAuth,
    parsePagination,
    paginate,
    getServiceManager,
    logger,
  });

  for (const svc of UPDATE_SERVICE_ROUTES) {
    app.use(
      `/api/${svc}`,
      createUpdatesRoute(svc, getServiceManager, factoryMiddleware)
    );
  }

  registerServiceAliasRoutes(app, {
    healthLimiter,
    requireServiceEnabled,
    healthCacheMiddleware,
    statsCacheMiddleware,
    requireAuth,
    getServiceManager,
    logger,
  });

  registerMetaRoutes(app, {
    healthLimiter,
    healthCacheMiddleware,
    requireAuth,
    sanitizeString,
    isValidServiceId,
    cachedConfig,
    getFrontendConfig,
    getServiceManager,
    logger,
  });

  registerRouterRoutes(app, {
    controlLimiter,
    requireAuth,
    verifyCsrf,
    requireAnyServiceEnabled,
    validateQuery,
    sanitizeString,
    parsePagination,
    isValidIPv4,
    getRouterArpData,
    paginate,
    getServiceManager,
    logger,
  });

  registerSecurityRoutes(app, {
    requireAuth,
    requireWhitelistedIP,
  });
}
