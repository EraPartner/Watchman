import { createServiceRoutes, createUpdatesRoute } from "./serviceFactory.js";
import { registerAuthRoutes } from "./authRoutes.js";
import { registerControlRoutes } from "./controlRoutes.js";
import { registerHomebridgeRoutes } from "./homebridgeRoutes.js";
import { registerInstanceServiceRoutes } from "./instanceRoutes.js";
import { registerMetaRoutes } from "./metaRoutes.js";
import { registerRouterRoutes } from "./routerRoutes.js";
import { registerSecurityRoutes } from "./securityRoutes.js";
import { registerServiceAliasRoutes } from "./serviceAliasRoutes.js";

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
    FRONTEND_URL,
    COOKIE_OPTIONS,
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
      createServiceRoutes(svc, getServiceManager, factoryMiddleware)
    );
  }

  app.use(
    "/api/bitcoin",
    createServiceRoutes("bitcoin", getServiceManager, factoryMiddleware)
  );

  app.use(
    "/api/tor",
    createServiceRoutes("tor", getServiceManager, factoryMiddleware)
  );

  app.use(
    "/api/homebridge",
    createServiceRoutes("homebridge", getServiceManager, factoryMiddleware)
  );

  registerHomebridgeRoutes(app, {
    requireServiceEnabled,
    statsCacheMiddleware,
    requireAuth,
    parsePagination,
    paginate,
    getServiceManager,
    logger,
  });

  for (const svc of ["adguard", "bitcoin", "tor", "homebridge"]) {
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
