// Simple request body validation helpers (no external deps)
export function requireFields(fields) {
  return (req, res, next) => {
    const body = req.body || {};
    for (const f of fields) {
      if (!(f in body)) {
        return res.status(400).json({ error: `Missing field: ${f}` });
      }
    }
    next();
  };
}

export function requireBoolean(field) {
  return (req, res, next) => {
    const val = req.body && req.body[field];
    if (typeof val !== "boolean") {
      return res.status(400).json({ error: `Field ${field} must be boolean` });
    }
    next();
  };
}

export function requireString(field, options = {}) {
  const { minLength = 1, maxLength = 1000, pattern = null } = options;
  return (req, res, next) => {
    const val = req.body && req.body[field];
    if (typeof val !== "string" || val.trim().length === 0) {
      return res
        .status(400)
        .json({ error: `Field ${field} must be a non-empty string` });
    }
    if (val.length < minLength || val.length > maxLength) {
      return res.status(400).json({
        error: `Field ${field} must be between ${minLength} and ${maxLength} characters`,
      });
    }
    if (pattern && !pattern.test(val)) {
      return res.status(400).json({
        error: `Field ${field} format is invalid`,
      });
    }
    next();
  };
}

/**
 * Sanitize a string by removing potentially dangerous characters
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeString(str) {
  if (typeof str !== "string") return "";
  // Remove control characters and null bytes
  return str.replace(/[\x00-\x1F\x7F]/g, "").trim();
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
