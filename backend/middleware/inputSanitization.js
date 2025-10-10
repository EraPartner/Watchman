// Advanced input sanitization and validation
import logger from "./logger.js";

/**
 * Sanitize string input to prevent XSS and injection attacks
 */
export function sanitizeString(input) {
  if (typeof input !== "string") return input;

  return input
    .replace(/[<>]/g, "") // Remove angle brackets
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, "") // Remove event handlers
    .trim();
}

/**
 * Deep sanitize objects recursively
 */
export function deepSanitize(obj) {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => deepSanitize(item));
  }

  if (typeof obj === "object") {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize key
      const cleanKey = sanitizeString(key);
      sanitized[cleanKey] = deepSanitize(value);
    }
    return sanitized;
  }

  if (typeof obj === "string") {
    return sanitizeString(obj);
  }

  return obj;
}

/**
 * Middleware to sanitize all request inputs
 */
export function sanitizeInputs(req, res, next) {
  try {
    if (req.body) {
      req.body = deepSanitize(req.body);
    }

    if (req.query) {
      req.query = deepSanitize(req.query);
    }

    if (req.params) {
      req.params = deepSanitize(req.params);
    }

    next();
  } catch (error) {
    logger.error("Input sanitization error", { error: error.message });
    res.status(400).json({ error: "Invalid input" });
  }
}

/**
 * Validate email format
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate URL format
 */
export function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Validate IP address format
 */
export function isValidIP(ip) {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){7}[0-9a-fA-F]{0,4}$/;

  if (ipv4Regex.test(ip)) {
    const parts = ip.split(".");
    return parts.every((part) => parseInt(part) <= 255);
  }

  return ipv6Regex.test(ip);
}

/**
 * Check for SQL injection patterns
 */
export function hasSQLInjection(input) {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|DECLARE)\b)/i,
    /--/,
    /\/\*/,
    /;.*--/,
    /'\s*OR\s*'1'\s*=\s*'1/i,
    /'\s*OR\s*1\s*=\s*1/i,
  ];

  return sqlPatterns.some((pattern) => pattern.test(input));
}

/**
 * Check for XSS patterns
 */
export function hasXSS(input) {
  const xssPatterns = [
    /<script/i,
    /javascript:/i,
    /onerror\s*=/i,
    /onclick\s*=/i,
    /onload\s*=/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
  ];

  return xssPatterns.some((pattern) => pattern.test(input));
}

/**
 * Check for path traversal patterns
 */
export function hasPathTraversal(input) {
  const pathPatterns = [/\.\.[\/\\]/, /\.\.%2[fF]/, /\.\.%5[cC]/];

  return pathPatterns.some((pattern) => pattern.test(input));
}

/**
 * Comprehensive input validation middleware
 */
export function validateInputSecurity(req, res, next) {
  const checkString = JSON.stringify({
    body: req.body,
    query: req.query,
    params: req.params,
  });

  // Check for various attack patterns
  if (hasSQLInjection(checkString)) {
    logger.warn("SQL injection attempt detected", {
      ip: req.ip,
      path: req.path,
      requestId: req.requestId,
    });
    return res.status(400).json({ error: "Invalid input detected" });
  }

  if (hasXSS(checkString)) {
    logger.warn("XSS attempt detected", {
      ip: req.ip,
      path: req.path,
      requestId: req.requestId,
    });
    return res.status(400).json({ error: "Invalid input detected" });
  }

  if (hasPathTraversal(checkString)) {
    logger.warn("Path traversal attempt detected", {
      ip: req.ip,
      path: req.path,
      requestId: req.requestId,
    });
    return res.status(400).json({ error: "Invalid input detected" });
  }

  next();
}

/**
 * Validate password strength
 */
export function validatePasswordStrength(password) {
  const errors = [];

  if (password.length < 12) {
    errors.push("Password must be at least 12 characters long");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  if (!/[^a-zA-Z0-9]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  // Check for common passwords
  const commonPasswords = [
    "password",
    "123456",
    "qwerty",
    "admin",
    "letmein",
    "welcome",
    "monkey",
    "dragon",
    "master",
    "sunshine",
  ];

  if (
    commonPasswords.some((common) => password.toLowerCase().includes(common))
  ) {
    errors.push("Password contains common words");
  }

  return {
    valid: errors.length === 0,
    errors,
    strength: calculatePasswordStrength(password),
  };
}

/**
 * Calculate password strength score (0-100)
 */
function calculatePasswordStrength(password) {
  let score = 0;

  // Length
  score += Math.min(password.length * 2, 40);

  // Character variety
  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 10;
  if (/[0-9]/.test(password)) score += 10;
  if (/[^a-zA-Z0-9]/.test(password)) score += 15;

  // Multiple character types
  const types = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((regex) =>
    regex.test(password)
  ).length;

  score += types * 5;

  return Math.min(score, 100);
}

/**
 * Rate limiting for specific operations per user
 */
class UserActionRateLimiter {
  constructor() {
    this.actions = new Map();
    this.limits = {
      passwordChange: { max: 3, window: 3600000 }, // 3 per hour
      settingsChange: { max: 10, window: 600000 }, // 10 per 10 minutes
      serviceControl: { max: 30, window: 60000 }, // 30 per minute
    };

    // Cleanup every 5 minutes
    setInterval(() => this.cleanup(), 300000);
  }

  checkLimit(username, action) {
    const key = `${username}:${action}`;
    const limit = this.limits[action];

    if (!limit) return { allowed: true };

    const now = Date.now();

    if (!this.actions.has(key)) {
      this.actions.set(key, []);
    }

    const timestamps = this.actions.get(key);
    const recentActions = timestamps.filter((t) => now - t < limit.window);

    if (recentActions.length >= limit.max) {
      return {
        allowed: false,
        retryAfter: Math.ceil((recentActions[0] + limit.window - now) / 1000),
      };
    }

    recentActions.push(now);
    this.actions.set(key, recentActions);

    return { allowed: true };
  }

  cleanup() {
    const now = Date.now();
    for (const [key, timestamps] of this.actions.entries()) {
      const action = key.split(":")[1];
      const limit = this.limits[action];

      if (limit) {
        const recent = timestamps.filter((t) => now - t < limit.window);
        if (recent.length === 0) {
          this.actions.delete(key);
        } else {
          this.actions.set(key, recent);
        }
      }
    }
  }
}

export const userActionLimiter = new UserActionRateLimiter();

/**
 * Middleware to enforce user action rate limits
 */
export function limitUserAction(actionType) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = userActionLimiter.checkLimit(req.user.username, actionType);

    if (!result.allowed) {
      logger.warn("User action rate limit exceeded", {
        username: req.user.username,
        action: actionType,
        retryAfter: result.retryAfter,
      });

      return res.status(429).json({
        error: "Too many actions. Please try again later.",
        retryAfter: result.retryAfter,
      });
    }

    next();
  };
}
