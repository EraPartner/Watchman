/**
 * Production Security Configuration
 * Centralised security settings for Watchman application
 */

// Security configuration constants
export const SECURITY_CONFIG = {
  // Authentication settings
  AUTH: {
    JWT_MIN_SECRET_LENGTH: 32,
    JWT_EXPIRY: "15m",
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
    BCRYPT_ROUNDS: 12, // Updated to stronger hashing rounds
  },

  // Rate limiting configuration
  RATE_LIMITS: {
    GENERAL: { windowMs: 60 * 1000, max: 100 },
    AUTH: { windowMs: 15 * 60 * 1000, max: 10 },
    CONTROL: { windowMs: 5 * 60 * 1000, max: 10 },
    HEALTH: { windowMs: 60 * 1000, max: 200 },
  },

  // Security headers
  HEADERS: {
    CSP_DIRECTIVES: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
    PERMISSIONS_POLICY:
      "geolocation=(), microphone=(), camera=(), payment=(), usb=(), " +
      "magnetometer=(), gyroscope=(), accelerometer=()",
  },

  // Input validation
  VALIDATION: {
    MAX_USERNAME_LENGTH: 128,
    MAX_PASSWORD_LENGTH: 256,
    MAX_REQUEST_BODY_SIZE: "10mb",
    ALLOWED_COMMANDS: [
      "uptime",
      "df",
      "free",
      "top",
      "ps",
      "systemctl",
      "service",
      "netstat",
      "ss",
      "lsof",
      "iostat",
      "vmstat",
      "sar",
      "uname",
      "hostname",
      "who",
      "w",
      "last",
    ],
  },

  // Cookie security
  COOKIES: {
    HTTP_ONLY: true,
    SAME_SITE: "strict", // For production
    SECURE: true, // For production HTTPS
    MAX_AGE: 8 * 60 * 60 * 1000, // 8 hours
  },

  // CORS configuration
  CORS: {
    CREDENTIALS: true,
    MAX_AGE: 86400, // 24 hours
    METHODS: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    ALLOWED_HEADERS: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
      "X-CSRF-Token",
    ],
  },

  // Cache security
  CACHE: {
    HEALTH_TTL: 10,
    STATS_TTL: 30,
    LONGTERM_TTL: 300,
    MAX_KEYS: 1000,
  },

  // Logging security
  LOGGING: {
    REDACT_PATTERNS: [
      "password",
      "secret",
      "token",
      "auth",
      "credential",
      "Bearer",
      "Authorization",
      "X-API-Key",
    ],
    MAX_LOG_SIZE: "50mb",
    MAX_LOG_FILES: 7,
    LOG_ROTATION: true,
  },

  // Production requirements
  PRODUCTION: {
    REQUIRE_HTTPS: true,
    REQUIRE_STRONG_JWT_SECRET: true,
    REQUIRE_FRONTEND_URL: true,
    DISABLE_DEBUG_LOGS: true,
    ENABLE_SECURITY_HEADERS: true,
  },
};

/**
 * Validate production security requirements
 */
export function validateProductionSecurity() {
  const errors = [];

  if (process.env.NODE_ENV === "production") {
    // Check HTTPS requirement
    if (
      SECURITY_CONFIG.PRODUCTION.REQUIRE_HTTPS &&
      process.env.FRONTEND_URL &&
      !process.env.FRONTEND_URL.startsWith("https://")
    ) {
      errors.push("FRONTEND_URL must use HTTPS in production");
    }

    // Check JWT secret strength
    if (
      SECURITY_CONFIG.PRODUCTION.REQUIRE_STRONG_JWT_SECRET &&
      (!process.env.JWT_SECRET ||
        process.env.JWT_SECRET.length <
          SECURITY_CONFIG.AUTH.JWT_MIN_SECRET_LENGTH)
    ) {
      errors.push(
        `JWT_SECRET must be at least ${SECURITY_CONFIG.AUTH.JWT_MIN_SECRET_LENGTH} characters in production`
      );
    }

    // Check frontend URL is configured
    if (
      SECURITY_CONFIG.PRODUCTION.REQUIRE_FRONTEND_URL &&
      !process.env.FRONTEND_URL
    ) {
      errors.push("FRONTEND_URL is required in production");
    }
  }

  return errors;
}

/**
 * Get secure cookie options based on environment
 */
export function getSecureCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  const isHttps = process.env.FRONTEND_URL?.startsWith("https://");

  return {
    httpOnly: SECURITY_CONFIG.COOKIES.HTTP_ONLY,
    secure: isProduction && isHttps,
    sameSite: isProduction ? SECURITY_CONFIG.COOKIES.SAME_SITE : "lax",
    maxAge: SECURITY_CONFIG.COOKIES.MAX_AGE,
    path: "/",
  };
}

/**
 * Get rate limit configuration for a specific endpoint type
 */
export function getRateLimitConfig(type = "GENERAL") {
  return (
    SECURITY_CONFIG.RATE_LIMITS[type] || SECURITY_CONFIG.RATE_LIMITS.GENERAL
  );
}

export default SECURITY_CONFIG;
