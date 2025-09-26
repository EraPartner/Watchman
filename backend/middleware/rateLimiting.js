import rateLimit from 'express-rate-limit';

// General API rate limit - more permissive for dashboard usage
export const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks from localhost
    return req.ip === '127.0.0.1' && req.path === '/health';
  }
});

// Strict rate limit for control endpoints (like AdGuard protection toggle)
export const controlLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Limit control actions
  message: {
    error: 'Too many control requests, please wait before trying again.',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Auth rate limit (protect login endpoint)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 login attempts per window per IP
  message: {
    error: 'Too many login attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Very permissive rate limit for health/status endpoints
export const healthLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200, // Allow frequent health checks
  message: {
    error: 'Health check rate limit exceeded.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false
});