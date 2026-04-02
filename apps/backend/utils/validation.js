import path from "path";

/**
 * Input Validation & Sanitization Utilities
 *
 * Provides validation and sanitization helpers for user input
 * to prevent injection attacks and malformed data.
 *
 * @fileoverview Input validation utilities
 * @author Watchman Team
 * @version 1.0.0
 */

/**
 * Sanitize a string to prevent injection attacks
 * @param {string} input - Input string
 * @param {number} maxLength - Maximum allowed length
 * @returns {string|null} Sanitized string or null if invalid
 */
export function sanitizeString(input, maxLength = 255) {
  if (input === null || input === undefined) return null;
  if (typeof input !== "string") return null;

  // Remove control characters except tab/newline/carriage return
  const sanitized = input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();

  // Enforce max length
  if (sanitized.length > maxLength) {
    return sanitized.substring(0, maxLength);
  }

  return sanitized || null;
}

/**
 * Validate a service ID (alphanumeric, dash, underscore)
 * @param {string} serviceId - Service identifier
 * @returns {boolean} True if valid
 */
export function isValidServiceId(serviceId) {
  if (!serviceId || typeof serviceId !== "string") return false;
  return /^[a-zA-Z0-9_-]{1,64}$/.test(serviceId);
}

/**
 * Validate an IP address (IPv4)
 * @param {string} ip - IP address string
 * @returns {boolean} True if valid IPv4
 */
export function isValidIPv4(ip) {
  if (!ip || typeof ip !== "string") return false;
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(ip)) return false;

  const parts = ip.split(".").map(Number);
  return parts.every((part) => part >= 0 && part <= 255);
}

/**
 * Validate a port number
 * @param {number|string} port - Port number
 * @returns {boolean} True if valid
 */
export function isValidPort(port) {
  const num = parseInt(port, 10);
  return !isNaN(num) && num >= 1 && num <= 65535;
}

/**
 * Validate a file path - prevents path traversal
 * @param {string} filePath - File path
 * @param {string} baseDir - Allowed base directory
 * @returns {boolean} True if path is safe
 */
export function isSafePath(filePath, baseDir) {
  if (!filePath || typeof filePath !== "string") return false;

  // Null byte check
  if (filePath.includes("\0")) {
    return false;
  }

  const normalizedPath = path.normalize(filePath);

  // Reject explicit traversal segments in normalized path
  const segments = normalizedPath
    .split(path.sep)
    .filter(Boolean)
    .map((segment) => segment.trim());

  if (segments.includes("..")) {
    return false;
  }

  // If baseDir is provided, enforce resolved path containment
  if (baseDir && typeof baseDir === "string") {
    const resolvedBase = path.resolve(baseDir);
    const resolvedTarget = path.resolve(normalizedPath);
    const relative = path.relative(resolvedBase, resolvedTarget);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate hostname (for URL validation)
 * @param {string} hostname - Hostname
 * @returns {boolean} True if valid
 */
export function isValidHostname(hostname) {
  if (!hostname || typeof hostname !== "string") return false;
  if (hostname.length > 253) return false;

  // Allow IP addresses and hostnames
  const hostnameRegex =
    /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
  return hostnameRegex.test(hostname) || isValidIPv4(hostname);
}

/**
 * Express middleware factory for validating query params
 * @param {Object} schema - Validation schema
 * @param {string} schema.field - Field name
 * @param {Function} schema.validator - Validation function
 * @param {string} schema.sanitizer - Optional sanitizer function
 * @returns {Function} Express middleware
 */
export function validateQuery(schema = {}) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, config] of Object.entries(schema)) {
      const value = req.query[field];

      // Skip if not present and not required
      if (value === undefined && !config.required) continue;

      // Validate
      if (config.validator && !config.validator(value)) {
        errors.push(`Invalid parameter: ${field}`);
        continue;
      }

      // Sanitize if needed
      if (config.sanitizer && value) {
        req.query[field] = config.sanitizer(value);
      }
    }

    if (errors.length > 0) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: errors });
    }

    next();
  };
}

/**
 * Express middleware for validating path params
 * @param {Object} schema - Validation schema
 * @returns {Function} Express middleware
 */
export function validateParams(schema = {}) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, config] of Object.entries(schema)) {
      const value = req.params[field];

      if (config.validator && !config.validator(value)) {
        errors.push(`Invalid path parameter: ${field}`);
      }
    }

    if (errors.length > 0) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: errors });
    }

    next();
  };
}

/**
 * Sanitize object recursively (for request bodies)
 * @param {any} obj - Object to sanitize
 * @returns {any} Sanitized object
 */
export function sanitizeObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return sanitizeString(obj, 1000);
  if (typeof obj === "number" || typeof obj === "boolean") return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }
  if (typeof obj === "object") {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      // Only allow safe keys
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        sanitized[key] = sanitizeObject(value);
      }
    }
    return sanitized;
  }
  return null;
}
