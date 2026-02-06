/**
 * Security middleware for enhanced request validation and error handling
 * Implements OWASP security best practices
 */
import logger from "./logger.js";

/**
 * Comprehensive input validation middleware
 */
export function validateInput(req, res, next) {
  // Validate request size
  const contentLength = req.get("content-length");
  if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
    // 10MB limit
    logger.warning("Request too large", {
      size: contentLength,
      ip: req.ip,
      path: req.path,
    });
    return res.status(413).json({ error: "Request entity too large" });
  }

  // Validate request path for path traversal attempts
  if (req.path.includes("../") || req.path.includes("..\\")) {
    logger.warning("Path traversal attempt detected", {
      path: req.path,
      ip: req.ip,
    });
    return res.status(400).json({ error: "Invalid request path" });
  }

  // Validate query parameters
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === "string") {
      // Check for potential injection patterns
      const suspiciousPatterns = [
        /[<>"']/, // XSS patterns (fixed escaping)
        /(\|\||&&|;)/, // Command injection (fixed escaping)
        /(union|select|insert|update|delete|drop|exec|script)/i, // SQL injection
        /(javascript|vbscript|onload|onerror)/i, // Script injection
      ];

      if (suspiciousPatterns.some((pattern) => pattern.test(value))) {
        logger.warning("Suspicious query parameter detected", {
          key,
          value: value.substring(0, 100), // Log first 100 chars only
          ip: req.ip,
          path: req.path,
        });
        return res.status(400).json({ error: "Invalid query parameter" });
      }
    }
  }

  next();
}

/**
 * Security headers middleware
 */
export function securityHeaders(req, res, next) {
  // Add security headers for enhanced protection
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Download-Options", "noopen");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Add request ID for correlation
  res.setHeader("X-Request-ID", req.id || "unknown");

  // Cache control for sensitive endpoints
  if (req.path.startsWith("/api/") && !req.path.includes("/health")) {
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }

  next();
}

/**
 * Enhanced error handler that prevents information leakage
 */
export function secureErrorHandler(err, req, res, next) {
  // Log the full error internally
  logger.error("Request error", {
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    requestId: req.id,
  });

  // Determine response based on error type and environment
  const isDevelopment = process.env.NODE_ENV === "development";
  const status = err.status || err.statusCode || 500;

  let message = "Internal server error";

  // Only expose certain error types to clients
  if (status < 500) {
    message = err.message || "Bad request";
  } else if (isDevelopment) {
    message = err.message;
  }

  // Send sanitized error response
  res.status(status).json({
    error: message,
    requestId: req.id,
    ...(isDevelopment && status >= 500 ? { stack: err.stack } : {}),
  });
}

/**
 * Request logging middleware for security monitoring
 */
export function securityLogger(req, res, next) {
  const startTime = Date.now();

  // Log request start
  logger.info("Request started", {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    requestId: req.id,
    authenticated: !!req.user,
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - startTime;

    // Log request completion
    logger.info("Request completed", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      requestId: req.id,
    });

    // Log security events
    if (res.statusCode === 401) {
      logger.warning("Unauthorized access attempt", {
        path: req.path,
        ip: req.ip,
        userAgent: req.get("user-agent"),
        requestId: req.id,
      });
    } else if (res.statusCode === 403) {
      logger.warning("Forbidden access attempt", {
        path: req.path,
        ip: req.ip,
        userAgent: req.get("user-agent"),
        requestId: req.id,
      });
    }

    originalEnd.apply(this, args);
  };

  next();
}
