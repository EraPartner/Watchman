import NodeCache from 'node-cache';

// Cache instances with different TTL strategies
const healthCache = new NodeCache({ 
  stdTTL: 10, // 10 seconds for health checks
  checkperiod: 15,
  useClones: false // Better performance for simple objects
});

const statsCache = new NodeCache({ 
  stdTTL: 30, // 30 seconds for stats
  checkperiod: 45,
  useClones: false
});

const longTermCache = new NodeCache({ 
  stdTTL: 300, // 5 minutes for less frequently changing data
  checkperiod: 360,
  useClones: false
});

/**
 * Cache middleware factory
 * @param {NodeCache} cache - Cache instance to use
 * @param {Function} keyGenerator - Function to generate cache key from req
 */
export const cacheMiddleware = (cache, keyGenerator = (req) => req.url) => {
  return (req, res, next) => {
    const key = keyGenerator(req);
    const cached = cache.get(key);
    
    if (cached) {
      console.log(`🎯 Cache hit for ${key}`);
      return res.json(cached);
    }
    
    // Store original res.json
    const originalJson = res.json.bind(res);
    
    // Override res.json to cache successful responses
    res.json = function(data) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(key, data);
        console.log(`💾 Cached response for ${key}`);
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
export const clearCache = (type = 'all') => {
  switch (type) {
    case 'health':
      healthCache.flushAll();
      break;
    case 'stats':
      statsCache.flushAll();
      break;
    case 'longterm':
      longTermCache.flushAll();
      break;
    default:
      healthCache.flushAll();
      statsCache.flushAll();
      longTermCache.flushAll();
  }
  console.log(`🗑️ Cleared ${type} cache`);
};

export const getCacheStats = () => ({
  health: healthCache.getStats(),
  stats: statsCache.getStats(),
  longterm: longTermCache.getStats()
});