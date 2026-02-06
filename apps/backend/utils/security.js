/**
 * Security Utilities
 *
 * Centralised security utilities and helpers for the Watchman backend.
 * Provides secure input validation, sanitisation, cryptographic utilities,
 * and security-focused helper functions. Implements defence-in-depth
 * security measures and follows OWASP best practices.
 *
 * @fileoverview Security utilities and validation helpers
 * @author Watchman Team
 * @version 1.0.0
 */

import crypto from "crypto";

/**
 * Security configuration constants
 */
export const SECURITY_CONSTANTS = {
  // Password requirements
  MIN_PASSWORD_LENGTH: 12,
  MAX_PASSWORD_LENGTH: 128,

  // Token settings
  TOKEN_LENGTH: 32,
  CSRF_TOKEN_LENGTH: 32,

  // Rate limiting
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes

  // Input validation limits
  MAX_INPUT_LENGTH: 1000,
  MAX_HEADER_LENGTH: 8192,
  MAX_URL_LENGTH: 2048,
};

/**
 * Suspicious patterns for injection attack detection
 */
export const SUSPICIOUS_PATTERNS = [
  // XSS patterns
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /vbscript:/gi,
  /on\w+\s*=/gi,

  // SQL injection patterns
  /(union|select|insert|update|delete|drop|exec|script)\s+/gi,
  /(\\|\\||&&|;)/g,

  // Command injection patterns
  /[|&;`$()]/g,

  // Path traversal
  /\.\.\//g,
  /\.\.[/\\]/g,

  // Null bytes
  /\0/g,
];

/**
 * Generate cryptographically secure random token
 *
 * @param {number} [length=32] - Token length in bytes
 * @returns {string} Hex-encoded random token
 */
export function generateSecureToken(length = SECURITY_CONSTANTS.TOKEN_LENGTH) {
  if (length < 16 || length > 128) {
    throw new Error("Token length must be between 16 and 128 bytes");
  }

  return crypto.randomBytes(length).toString("hex");
}

/**
 * Generate secure CSRF token
 *
 * @returns {string} CSRF token
 */
export function generateCSRFToken() {
  return generateSecureToken(SECURITY_CONSTANTS.CSRF_TOKEN_LENGTH);
}

/**
 * Validate CSRF token format and structure
 *
 * @param {string} token - CSRF token to validate
 * @returns {boolean} True if token is valid format
 */
export function isValidCSRFToken(token) {
  if (typeof token !== "string") {
    return false;
  }

  const expectedLength = SECURITY_CONSTANTS.CSRF_TOKEN_LENGTH * 2; // Hex encoding doubles length
  return token.length === expectedLength && /^[a-f0-9]+$/i.test(token);
}

/**
 * Secure input sanitisation
 *
 * Removes or escapes potentially dangerous characters from user input.
 * Implements multiple layers of sanitisation for defence-in-depth.
 *
 * @param {string} input - Input string to sanitise
 * @param {Object} options - Sanitisation options
 * @param {boolean} [options.allowHtml=false] - Allow HTML tags
 * @param {boolean} [options.strictMode=true] - Enable strict sanitisation
 * @returns {string} Sanitised input string
 */
export function sanitiseInput(input, options = {}) {
  if (typeof input !== "string") {
    return "";
  }

  const { allowHtml = false, strictMode = true } = options;

  let sanitised = input;

  // Remove null bytes (always dangerous)
  sanitised = sanitised.replace(/\0/g, "");

  // Remove or escape HTML if not allowed
  if (!allowHtml) {
    sanitised = sanitised.replace(/<[^>]*>/g, "");
  } else {
    // If HTML is allowed, at least escape dangerous script tags
    sanitised = sanitised.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      ""
    );
  }

  if (strictMode) {
    // Remove javascript: and vbscript: URLs
    sanitised = sanitised.replace(/javascript:/gi, "");
    sanitised = sanitised.replace(/vbscript:/gi, "");

    // Remove event handlers
    sanitised = sanitised.replace(/on\w+\s*=/gi, "");

    // Remove potential command injection characters
    sanitised = sanitised.replace(/[|&;`$]/g, "");
  }

  return sanitised.trim();
}

/**
 * Check input for suspicious patterns
 *
 * @param {string} input - Input to check
 * @returns {Object} Validation result with detected patterns
 */
export function detectSuspiciousPatterns(input) {
  if (typeof input !== "string") {
    return { suspicious: false, patterns: [] };
  }

  const detectedPatterns = [];

  for (let i = 0; i < SUSPICIOUS_PATTERNS.length; i++) {
    const pattern = SUSPICIOUS_PATTERNS[i];
    if (pattern.test(input)) {
      detectedPatterns.push(`Pattern ${i + 1}`);
    }
  }

  return {
    suspicious: detectedPatterns.length > 0,
    patterns: detectedPatterns,
    riskLevel:
      detectedPatterns.length > 2
        ? "HIGH"
        : detectedPatterns.length > 0
          ? "MEDIUM"
          : "LOW",
  };
}

/**
 * Validate and normalise URL for security
 *
 * @param {string} url - URL to validate
 * @param {Object} options - Validation options
 * @param {string[]} [options.allowedProtocols=['http', 'https']] - Allowed protocols
 * @param {string[]} [options.blockedHosts=[]] - Blocked hostnames
 * @returns {Object} Validation result
 */
export function validateURL(url, options = {}) {
  const {
    allowedProtocols = ["http", "https"],
    blockedHosts = ["127.0.0.1", "localhost", "0.0.0.0"],
  } = options;

  if (
    typeof url !== "string" ||
    url.length > SECURITY_CONSTANTS.MAX_URL_LENGTH
  ) {
    return { valid: false, error: "Invalid URL format or length" };
  }

  try {
    const parsedUrl = new URL(url);

    // Check protocol
    if (!allowedProtocols.includes(parsedUrl.protocol.slice(0, -1))) {
      return {
        valid: false,
        error: `Protocol ${parsedUrl.protocol} not allowed`,
      };
    }

    // Check for blocked hosts (prevent SSRF)
    if (blockedHosts.includes(parsedUrl.hostname.toLowerCase())) {
      return { valid: false, error: "Hostname not allowed" };
    }

    // Check for private IP ranges (basic SSRF protection)
    if (isPrivateIP(parsedUrl.hostname)) {
      return { valid: false, error: "Private IP addresses not allowed" };
    }

    return {
      valid: true,
      normalised: parsedUrl.toString(),
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
    };
  } catch (error) {
    return { valid: false, error: "Malformed URL" };
  }
}

/**
 * Check if hostname is a private IP address
 *
 * @param {string} hostname - Hostname to check
 * @returns {boolean} True if hostname is private IP
 * @private
 */
function isPrivateIP(hostname) {
  // Basic private IP range detection
  const privateRanges = [
    /^127\./, // Loopback
    /^10\./, // Class A private
    /^192\.168\./, // Class C private
    /^172\.(1[6-9]|2[0-9]|3[01])\./, // Class B private
    /^169\.254\./, // Link-local
    /^::1$/, // IPv6 loopback
    /^fc00:/, // IPv6 private
    /^fe80:/, // IPv6 link-local
  ];

  return privateRanges.some((range) => range.test(hostname));
}

/**
 * Secure string comparison to prevent timing attacks
 *
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} True if strings are equal
 */
export function secureStringCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Hash sensitive data for logging (one-way hash)
 *
 * @param {string} data - Data to hash
 * @returns {string} SHA256 hash (first 16 characters)
 */
export function hashForLogging(data) {
  if (typeof data !== "string") {
    return "invalid_data";
  }

  return crypto
    .createHash("sha256")
    .update(data)
    .digest("hex")
    .substring(0, 16);
}

/**
 * Validate password strength
 *
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with strength indicators
 */
export function validatePasswordStrength(password) {
  if (typeof password !== "string") {
    return { valid: false, errors: ["Password must be a string"] };
  }

  const errors = [];
  const checks = {
    length: password.length >= SECURITY_CONSTANTS.MIN_PASSWORD_LENGTH,
    maxLength: password.length <= SECURITY_CONSTANTS.MAX_PASSWORD_LENGTH,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    numbers: /\d/.test(password),
    symbols: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
    noSequences: !/(123|abc|qwe)/i.test(password),
    noRepeats: !/(.)\1{2,}/.test(password),
  };

  if (!checks.length) {
    errors.push(
      `Password must be at least ${SECURITY_CONSTANTS.MIN_PASSWORD_LENGTH} characters long`
    );
  }
  if (!checks.maxLength) {
    errors.push(
      `Password must be no more than ${SECURITY_CONSTANTS.MAX_PASSWORD_LENGTH} characters long`
    );
  }
  if (!checks.lowercase) {
    errors.push("Password must contain lowercase letters");
  }
  if (!checks.uppercase) {
    errors.push("Password must contain uppercase letters");
  }
  if (!checks.numbers) {
    errors.push("Password must contain numbers");
  }
  if (!checks.symbols) {
    errors.push("Password must contain special characters");
  }
  if (!checks.noSequences) {
    errors.push("Password cannot contain common sequences");
  }
  if (!checks.noRepeats) {
    errors.push("Password cannot contain repeated characters");
  }

  const strength = Object.values(checks).filter(Boolean).length;
  const strengthLevel =
    strength >= 7 ? "STRONG" : strength >= 5 ? "MEDIUM" : "WEAK";

  return {
    valid: errors.length === 0,
    errors,
    strength: strengthLevel,
    score: strength,
  };
}
