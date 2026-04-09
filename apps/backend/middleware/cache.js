/**
 * Cache Middleware
 *
 * Provides intelligent caching middleware for different types of data.
 * Implements multiple cache instances with different TTL strategies
 * for health checks, statistics, and long-term data. Features
 * performance optimization and comprehensive error handling.
 *
 * @fileoverview Intelligent caching middleware with multiple TTL strategies
 * @author Watchman Team
 * @version 1.0.0
 */

import NodeCache from "node-cache";
import { logger } from "./logger.js";

/**
 * Cache TTL configuration (in seconds) - configurable via environment variables
 * Provides different caching strategies for different types of data
 */
const CACHE_HEALTH_TTL = parseInt(process.env.CACHE_HEALTH_TTL) || 10;
const CACHE_STATS_TTL = parseInt(process.env.CACHE_STATS_TTL) || 30;
const CACHE_LONGTERM_TTL = parseInt(process.env.CACHE_LONGTERM_TTL) || 300;

/**
 * Health cache for frequent health check requests
 * Short TTL for near real-time health monitoring
 */
const healthCache = new NodeCache({
  stdTTL: CACHE_HEALTH_TTL, // Default 10 seconds for health checks
  checkperiod: Math.ceil(CACHE_HEALTH_TTL * 1.5),
  useClones: true, // Safer cloning
  maxKeys: 1000, // Limit memory usage
});

/**
 * Statistics cache for service statistics
 * Medium TTL for balanced performance and data freshness
 */
const statsCache = new NodeCache({
  stdTTL: CACHE_STATS_TTL, // Default 30 seconds for stats
  checkperiod: Math.ceil(CACHE_STATS_TTL * 1.5),
  useClones: true,
  maxKeys: 500, // Limit memory usage
});

/**
 * Long-term cache for less frequently changing data
 * Longer TTL for configuration and system information
 */
const longTermCache = new NodeCache({
  stdTTL: CACHE_LONGTERM_TTL, // Default 5 minutes for less frequently changing data
  checkperiod: Math.ceil(CACHE_LONGTERM_TTL * 1.2),
  useClones: true,
  maxKeys: 200, // Limit memory usage
});

/**
 * Generic cache middleware factory
 *
 * Creates cache middleware for Express routes with custom key generation
 * and intelligent cache miss handling.
 *
 * @param {NodeCache} cache - Cache instance to use
 * @param {Function} keyGenerator - Function to generate cache key from request
 * @param {Object} options - Cache middleware options
 * @param {boolean} [options.skipCacheOnError=true] - Skip caching if response has error
 * @param {number[]} [options.cacheOnlyStatusCodes=[200]] - Only cache these HTTP status codes
 * @returns {Function} Express middleware function
 */
export const cacheMiddleware = (
  cache,
  keyGenerator = (req) => req.url,
  options = {}
) => {
  const {
    skipCacheOnError = true,
    cacheOnlyStatusCodes = [200],
    methods = ["GET", "HEAD"],
  } = options;
  const allowedMethods = new Set(
    methods.map((method) => String(method).toUpperCase())
  );

  return (req, res, next) => {
    if (!allowedMethods.has(String(req.method || "").toUpperCase())) {
      return next();
    }

    let cacheKey;

    try {
      cacheKey = keyGenerator(req);

      // Validate cache key
      if (!cacheKey || typeof cacheKey !== "string") {
        logger.warn("Invalid cache key generated, skipping cache", {
          path: req.path,
          method: req.method,
          requestId: req.requestId,
        });
        return next();
      }

      // Check for cached response
      const cachedResponse = cache.get(cacheKey);
      if (cachedResponse !== undefined && cachedResponse !== null) {
        logger.debug(`Cache hit for ${cacheKey}`, {
          path: req.path,
          method: req.method,
          requestId: req.requestId,
        });

        // Add cache headers
        res.setHeader("X-Cache", "HIT");
        const ttl = cache.getTtl(cacheKey);
        if (typeof ttl === "number") {
          const ttlSeconds = Math.max(0, Math.ceil((ttl - Date.now()) / 1000));
          res.setHeader("X-Cache-TTL", String(ttlSeconds));
        }

        return res.status(200).json(cachedResponse);
      }

      logger.debug(`Cache miss for ${cacheKey}`, {
        path: req.path,
        method: req.method,
        requestId: req.requestId,
      });
      res.setHeader("X-Cache", "MISS");
    } catch (error) {
      // If cache lookup fails, don't block the request
      logger.warn("Cache middleware error (continuing)", {
        error: error?.message || error,
        path: req.path,
        method: req.method,
        requestId: req.requestId,
      });
    }

    if (!cacheKey) {
      return next();
    }

    // Override res.json to cache successful responses
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      try {
        // Only cache successful responses
        if (cacheOnlyStatusCodes.includes(res.statusCode)) {
          if (!skipCacheOnError || !body?.error) {
            cache.set(cacheKey, body);
            logger.debug(`Cached response for ${cacheKey}`, {
              path: req.path,
              method: req.method,
              requestId: req.requestId,
            });
          }
        }
      } catch (error) {
        logger.warn("Failed to cache response", {
          error: error?.message || error,
          path: req.path,
          method: req.method,
          requestId: req.requestId,
        });
      }

      return originalJson(body);
    };

    next();
  };
};

// Pre-configured middleware for different cache types
export const healthCacheMiddleware = cacheMiddleware(healthCache);
export const statsCacheMiddleware = cacheMiddleware(statsCache);

// Cache management utilities
export const clearCache = (type = "all") => {
  switch (type) {
    case "health":
      healthCache.flushAll();
      break;
    case "stats":
      statsCache.flushAll();
      break;
    case "longterm":
      longTermCache.flushAll();
      break;
    default:
      healthCache.flushAll();
      statsCache.flushAll();
      longTermCache.flushAll();
  }
  logger.info(`Cache cleared for type: ${type}`);
};
