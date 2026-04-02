/**
 * Request Validation Middleware
 *
 * Provides comprehensive input validation helpers for Express routes.
 * Implements security-first validation with input sanitisation,
 * type checking, and length constraints to prevent injection attacks.
 *
 * @fileoverview Secure input validation middleware
 * @author Watchman Team
 * @version 1.0.0
 */

/**
 * Middleware to require specific fields in request body
 *
 * Validates that all specified fields are present in the request body.
 * Provides clear error messages for missing fields.
 *
 * @param {string[]} fields - Array of required field names
 * @returns {Function} Express middleware function
 *
 * @example
 * app.post('/api/login', requireFields(['username', 'password']), ...)
 */
export function requireFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error("requireFields expects a non-empty array of field names");
  }

  return (req, res, next) => {
    const body = req.body || {};

    for (const field of fields) {
      if (typeof field !== "string") {
        return res.status(500).json({ error: "Server validation error" });
      }

      if (
        !(field in body) ||
        body[field] === null ||
        body[field] === undefined
      ) {
        return res.status(400).json({
          error: `Missing required field: ${field}`,
          field,
        });
      }
    }
    next();
  };
}

/**
 * Middleware to require a boolean field in request body
 *
 * Validates that the specified field is a boolean value.
 * Provides type-safe validation for boolean flags.
 *
 * @param {string} field - Field name to validate as boolean
 * @returns {Function} Express middleware function
 *
 * @example
 * app.post('/api/settings', requireBoolean('enabled'), ...)
 */
export function requireBoolean(field) {
  if (typeof field !== "string") {
    throw new Error("requireBoolean expects a string field name");
  }

  return (req, res, next) => {
    const value = req.body?.[field];

    if (typeof value !== "boolean") {
      return res.status(400).json({
        error: `Field '${field}' must be a boolean value (true or false)`,
        field,
        received: typeof value,
      });
    }
    next();
  };
}

/**
 * Middleware to require a string field with validation options
 *
 * Validates string fields with length constraints and pattern matching.
 * Implements input sanitisation and security checks.
 *
 * @param {string} field - Field name to validate
 * @param {Object} options - Validation options
 * @param {number} [options.minLength=1] - Minimum string length
 * @param {number} [options.maxLength=1000] - Maximum string length
 * @param {RegExp} [options.pattern] - Pattern to match against
 * @param {boolean} [options.allowEmpty=false] - Whether to allow empty strings
 * @returns {Function} Express middleware function
 *
 * @example
 * app.post('/api/user', requireString('username', { minLength: 3, maxLength: 50 }), ...)
 */
export function requireString(field, options = {}) {
  if (typeof field !== "string") {
    throw new Error("requireString expects a string field name");
  }

  const {
    minLength = 1,
    maxLength = 1000,
    pattern = null,
    allowEmpty = false,
  } = options;

  // Validate configuration
  if (minLength < 0 || maxLength < 1 || minLength > maxLength) {
    throw new Error("Invalid length constraints");
  }

  return (req, res, next) => {
    const value = req.body?.[field];

    if (typeof value !== "string") {
      return res.status(400).json({
        error: `Field '${field}' must be a string`,
        field,
        received: typeof value,
      });
    }

    const trimmedValue = value.trim();

    if (!allowEmpty && trimmedValue.length === 0) {
      return res.status(400).json({
        error: `Field '${field}' cannot be empty`,
        field,
      });
    }

    if (value.length < minLength || value.length > maxLength) {
      return res.status(400).json({
        error: `Field '${field}' must be between ${minLength} and ${maxLength} characters`,
        field,
        actualLength: value.length,
      });
    }

    // Check for null bytes and other dangerous characters
    if (value.includes("\0") || value.includes("\x00")) {
      return res.status(400).json({
        error: `Field '${field}' contains invalid characters`,
        field,
      });
    }

    if (pattern && !pattern.test(value)) {
      return res.status(400).json({
        error: `Field '${field}' format is invalid`,
        field,
      });
    }

    next();
  };
}

/**
 * Validate and sanitize a service name/key
 * @param {string} name - Service name to validate
 * @returns {boolean} True if valid
 */
export function isValidServiceName(name) {
  if (typeof name !== "string") return false;
  // Only alphanumeric, hyphens, underscores
  return /^[a-zA-Z0-9_-]{1,64}$/.test(name);
}

/**
 * Validate query parameters to prevent injection attacks
 * @param {Object} query - Express query object
 * @param {string[]} allowedParams - List of allowed query parameter names
 * @returns {boolean} True if all params are allowed
 */
export function validateQueryParams(query, allowedParams) {
  if (!query || typeof query !== "object") return true;

  const allowedSet = new Set(allowedParams.map((p) => p.toLowerCase()));

  for (const key of Object.keys(query)) {
    if (!allowedSet.has(key.toLowerCase())) {
      return false;
    }
  }
  return true;
}
