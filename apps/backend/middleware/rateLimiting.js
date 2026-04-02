/**
 * Rate Limiting Middleware
 *
 * Provides comprehensive rate limiting for different API endpoints
 * with intelligent bypass logic and security-focused configuration.
 * Implements multiple rate limiting strategies for different endpoint types.
 *
 * @fileoverview Rate limiting middleware with security focus
 * @author Watchman Team
 * @version 1.0.0
 */

import rateLimit from "express-rate-limit";
import logger from "./logger.js";

/**
 * Enhanced IP validation for rate limit bypass
 *
 * @param {string} ip - IP address to validate
 * @returns {boolean} True if IP is localhost
 * @private
 */
function isLocalhostIP(ip) {
  const localhostIPs = ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"];
  return localhostIPs.includes(ip);
}

/**
 * Custom rate limit message generator
 *
 * @param {Object} options - Message options
 * @param {string} options.type - Rate limit type
 * @param {string} options.retryAfter - Retry after duration
 * @returns {Object} Error response object
 * @private
 */
function createRateLimitMessage(options) {
  const { type, retryAfter } = options;

  return {
    error: `Rate limit exceeded for ${type} requests`,
    message: "Too many requests from this IP address. Please try again later.",
    retryAfter,
    timestamp: new Date().toISOString(),
    type: "RATE_LIMIT_EXCEEDED",
  };
}

/**
 * General API rate limiter for dashboard usage
 * More permissive limits for regular API operations
 */
export const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: parseInt(process.env.RATE_LIMIT_GENERAL_MAX) || 100,
  message: createRateLimitMessage({ type: "general", retryAfter: "1 minute" }),
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers

  // Enhanced skip logic with security considerations
  skip: (req) => {
    const isLocalhost = isLocalhostIP(req.ip);
    const isHealthCheck = req.path === "/health";
    const userAgent = req.get("User-Agent")?.toLowerCase() || "";

    // More restrictive validation for bypass
    const hasValidUserAgent =
      userAgent.includes("health") ||
      userAgent.includes("monitoring") ||
      userAgent.includes("watchman-backend");

    // Only skip for legitimate localhost health checks
    return isLocalhost && isHealthCheck && hasValidUserAgent;
  },

  // Custom key generator for better tracking
  keyGenerator: (req) => {
    // Use forwarded IP if behind proxy, otherwise use connection IP
    return req.ip || req.connection.remoteAddress || "unknown";
  },

  // Custom handler for when rate limit is exceeded
  handler: (req, res, next, options) => {
    // Log the rate limit hit
    logger.warn("Rate limit reached", {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get("User-Agent"),
      limit: options.max,
      window: options.windowMs,
    });

    // Send the rate limit response
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Strict rate limiter for control endpoints
 * Applied to sensitive operations like service control actions
 */
export const controlLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minute window
  max: parseInt(process.env.RATE_LIMIT_CONTROL_MAX) || 10,
  message: createRateLimitMessage({ type: "control", retryAfter: "5 minutes" }),
  standardHeaders: true,
  legacyHeaders: false,

  // No bypass for control endpoints - always apply rate limiting
  skip: () => false,

  // Custom handler for control endpoint rate limit exceeded
  handler: (req, res, next, options) => {
    // Enhanced logging for control endpoint abuse
    logger.warn("Control endpoint rate limit reached - potential abuse", {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get("User-Agent"),
      body: req.body ? Object.keys(req.body) : [],
      timestamp: new Date().toISOString(),
    });

    // Send the rate limit response
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Authentication rate limiter for login protection
 * Protects against brute force attacks on authentication endpoints
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minute window
  max: parseInt(process.env.RATE_LIMIT_AUTH_MAX) || 10,
  message: createRateLimitMessage({
    type: "authentication",
    retryAfter: "15 minutes",
  }),
  standardHeaders: true,
  legacyHeaders: false,

  // No bypass for auth endpoints - security critical
  skip: () => false,

  // Custom handler for authentication rate limit exceeded
  handler: (req, res, next, options) => {
    // Enhanced security logging for auth attempts
    logger.warn("Authentication rate limit reached - possible brute force", {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get("User-Agent"),
      username: req.body?.username ? "[REDACTED]" : "not_provided",
      timestamp: new Date().toISOString(),
      severity: "HIGH",
    });

    // Send the rate limit response
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Health check rate limiter
 * More permissive for monitoring systems
 */
export const healthLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: parseInt(process.env.RATE_LIMIT_HEALTH_MAX) || 200,
  message: createRateLimitMessage({
    type: "health check",
    retryAfter: "1 minute",
  }),
  standardHeaders: true,
  legacyHeaders: false,

  // Allow bypass for legitimate localhost monitoring
  skip: (req) => {
    const isLocalhost = isLocalhostIP(req.ip);
    return isLocalhost;
  },
});
