import NodeCache from "node-cache";

// Cache TTL values (in seconds) - configurable via environment variables
const CACHE_HEALTH_TTL = parseInt(process.env.CACHE_HEALTH_TTL) || 10;
const CACHE_STATS_TTL = parseInt(process.env.CACHE_STATS_TTL) || 30;
const CACHE_LONGTERM_TTL = parseInt(process.env.CACHE_LONGTERM_TTL) || 300;

// Cache instances with different TTL strategies
const healthCache = new NodeCache({
  stdTTL: CACHE_HEALTH_TTL, // Configurable, default 10 seconds for health checks
  checkperiod: Math.ceil(CACHE_HEALTH_TTL * 1.5),
  useClones: false, // Better performance for simple objects
});

const statsCache = new NodeCache({
  stdTTL: CACHE_STATS_TTL, // Configurable, default 30 seconds for stats
  checkperiod: Math.ceil(CACHE_STATS_TTL * 1.5),
  useClones: false,
});

const longTermCache = new NodeCache({
  stdTTL: CACHE_LONGTERM_TTL, // Configurable, default 5 minutes for less frequently changing data
  checkperiod: Math.ceil(CACHE_LONGTERM_TTL * 1.2),
  useClones: false,
});

/**
 * Cache middleware factory
 * @param {NodeCache} cache - Cache instance to use
 * @param {Function} keyGenerator - Function to generate cache key from req
 */
export const cacheMiddleware = (cache, keyGenerator = (req) => req.url) => {
  return (req, res, next) => {
    let key;
    try {
      key = keyGenerator(req);
      const cached = cache.get(key);

      if (cached !== undefined && cached !== null) {
        // Explicitly send cached response with 200 status
        console.debug(`🎯 Cache hit for ${key}`);
        res.status(200).json(cached);
        return;
      }
    } catch (err) {
      // If cache lookup fails for any reason, don't block the request
      console.warn(
        "⚠️ Cache middleware error (continuing):",
        err && err.message ? err.message : err
      );
    }

    // Store original res.json
    const originalJson = res.json.bind(res);

    // Override res.json to cache successful responses
    res.json = function (data) {
      try {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            cache.set(key, data);
            console.debug(`💾 Cached response for ${key}`);
          } catch (e) {
            // ignore cache set errors
            console.warn(
              "⚠️ Failed to set cache for",
              key,
              e && e.message ? e.message : e,
            );
          }
        }
      } catch (_e) {
        // Cache error ignored to prevent request blocking
      }
      return originalJson(data);
    };

    next();
  };
};

// Pre-configured middleware for different cache types
export const healthCacheMiddleware = cacheMiddleware(healthCache);
export const statsCacheMiddleware = cacheMiddleware(statsCache);
export const longTermCacheMiddleware = cacheMiddleware(longTermCache);

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
  console.info(`🗑️ Cleared ${type} cache`);
};
