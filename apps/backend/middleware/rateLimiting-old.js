import rateLimit from "express-rate-limit";

// General API rate limit - more permissive for dashboard usage
export const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later.",
    retryAfter: "1 minute",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // More restrictive localhost check to prevent bypass
    const isLocalhost = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
      req.ip
    );
    const isHealthCheck = req.path === "/health";
    const hasValidUserAgent =
      req.get("User-Agent")?.toLowerCase().includes("health") ||
      req.get("User-Agent")?.toLowerCase().includes("monitoring");

    // Only skip for localhost health checks with appropriate user agent
    return isLocalhost && isHealthCheck && hasValidUserAgent;
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

  // Enhanced logging for control endpoint abuse
  onLimitReached: (req, res, options) => {
    console.warn("Control endpoint rate limit reached - potential abuse", {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get("User-Agent"),
      body: req.body ? Object.keys(req.body) : [],
      timestamp: new Date().toISOString(),
    });
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

  // Enhanced security logging for auth attempts
  onLimitReached: (req, res, options) => {
    console.warn("Authentication rate limit reached - possible brute force", {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get("User-Agent"),
      username: req.body?.username ? "[REDACTED]" : "not_provided",
      timestamp: new Date().toISOString(),
      severity: "HIGH",
    });
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

  // Allow bypass for legitimate monitoring
  skip: (req) => {
    const isLocalhost = isLocalhostIP(req.ip);
    const userAgent = req.get("User-Agent")?.toLowerCase() || "";

    const isMonitoringAgent =
      userAgent.includes("health") ||
      userAgent.includes("monitoring") ||
      userAgent.includes("nagios") ||
      userAgent.includes("zabbix") ||
      userAgent.includes("prometheus");

    return isLocalhost || isMonitoringAgent;
  },
});
