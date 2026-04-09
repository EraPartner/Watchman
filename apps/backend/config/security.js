/**
 * Security configuration for Watchman application
 * Centralizes security settings and validation rules
 */
export const SECURITY_CONFIG = {
  // Authentication settings
  AUTH: {
    JWT_EXPIRY: "8h",
    REFRESH_TOKEN_EXPIRY: "7d",
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
  },

  // Rate limiting configuration
  RATE_LIMITS: {
    GENERAL: { windowMs: 60 * 1000, max: 100 },
    AUTH: { windowMs: 15 * 60 * 1000, max: 10 },
    CONTROL: { windowMs: 5 * 60 * 1000, max: 10 },
    HEALTH: { windowMs: 60 * 1000, max: 200 },
  },

  // Input validation rules
  VALIDATION: {
    MAX_REQUEST_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_QUERY_PARAM_LENGTH: 1000,
    MAX_HEADER_LENGTH: 8192,
    ALLOWED_SERVICE_NAME_PATTERN: /^[a-zA-Z0-9_]+$/,
    SUSPICIOUS_PATTERNS: [
      /[<>"']/, // XSS patterns
      /(\|\||&&|;)/, // Command injection
      /(union|select|insert|update|delete|drop|exec|script)/i, // SQL injection
      /(javascript|vbscript|onload|onerror)/i, // Script injection
    ],
  },

  // Security headers
  HEADERS: {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "X-Download-Options": "noopen",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-XSS-Protection": "1; mode=block",
  },

  // CSRF settings
  CSRF: {
    COOKIE_NAME: process.env.CSRF_COOKIE_NAME || "csrfToken",
    HEADER_NAME: process.env.CSRF_HEADER_NAME || "x-csrf-token",
    TOKEN_LENGTH: 32,
  },

  // Content Security Policy
  CSP: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
    upgradeInsecureRequests: true,
  },

  // IP filtering settings
  IP_CONTROL: {
    WHITELIST_ONLY_ADMIN: true,
    AUTO_BAN_THRESHOLD: 50,
    AUTO_BAN_DURATION: 24 * 60 * 60 * 1000, // 24 hours
    EXCLUDED_PATHS: ["/health", "/api/docs"],
  },

  // Logging settings for security events
  LOGGING: {
    LOG_FAILED_AUTH: true,
    LOG_SUSPICIOUS_ACTIVITY: true,
    LOG_ADMIN_ACTIONS: true,
    MAX_LOG_RETENTION_DAYS: 90,
  },

  // Production security requirements
  PRODUCTION: {
    REQUIRE_HTTPS: true,
    REQUIRE_STRONG_JWT_SECRET: true,
    MIN_JWT_SECRET_LENGTH: 32,
    REQUIRE_FRONTEND_URL: true,
    DISABLE_DEBUG_LOGS: true,
  },
};

/**
 * Validate security configuration on startup
 */
export function validateSecurityConfig() {
  const errors = [];

  // Validate JWT secret
  if (!process.env.JWT_SECRET) {
    errors.push("JWT_SECRET is required");
  } else if (
    process.env.JWT_SECRET.length <
    SECURITY_CONFIG.PRODUCTION.MIN_JWT_SECRET_LENGTH
  ) {
    errors.push(
      `JWT_SECRET must be at least ${SECURITY_CONFIG.PRODUCTION.MIN_JWT_SECRET_LENGTH} characters`
    );
  }

  // Validate production requirements
  if (process.env.NODE_ENV === "production") {
    if (
      SECURITY_CONFIG.PRODUCTION.REQUIRE_FRONTEND_URL &&
      !process.env.FRONTEND_URL
    ) {
      errors.push("FRONTEND_URL is required in production");
    }

    // Allow HTTP for localhost and local development even in production mode
    if (
      SECURITY_CONFIG.PRODUCTION.REQUIRE_HTTPS &&
      process.env.FRONTEND_URL &&
      !process.env.FRONTEND_URL.startsWith("https://")
    ) {
      const url = process.env.FRONTEND_URL;
      const isLocalhost =
        url.includes("localhost") ||
        url.includes("127.0.0.1") ||
        url.includes("0.0.0.0");
      const isLocalNetwork = url.match(/https?:\/\/(192\.168\.|10\.|172\.)/);

      if (!isLocalhost && !isLocalNetwork) {
        errors.push(
          "FRONTEND_URL must use HTTPS in production (except for localhost/local network)"
        );
      }
    }
  }

  // Validate authentication configuration
  if (!process.env.AUTH_USERNAME) {
    errors.push("AUTH_USERNAME is required");
  }

  if (!process.env.AUTH_PASSWORD_HASH) {
    errors.push("AUTH_PASSWORD_HASH is required");
  }

  return errors;
}

export default SECURITY_CONFIG;
