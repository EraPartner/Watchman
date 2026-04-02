/**
 * API Response Standardization Middleware (non-breaking mode)
 *
 * Wraps JSON responses into a consistent envelope while preserving
 * original payload fields at top-level for backward compatibility.
 *
 * Envelope shape:
 * {
 *   success: boolean,
 *   data: object|null,
 *   error: string|null,
 *   message: string|null,
 *   requestId: string|null,
 *   timestamp: string,
 *   ...originalPayload
 * }
 */

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Install response helpers and optional automatic wrapping.
 *
 * Non-breaking behavior:
 * - Existing keys remain present at top-level.
 * - Adds standardized fields (success/data/error/message/requestId/timestamp).
 * - Preserves status codes.
 */
export function apiResponseStandardizer(options = {}) {
  const autoWrap = options.autoWrap !== false;
  const wrapOnlyPlainObjects = options.wrapOnlyPlainObjects !== false;

  return (req, res, next) => {
    if (res.locals.__apiStandardizerInstalled) {
      return next();
    }
    res.locals.__apiStandardizerInstalled = true;

    const originalJson = res.json.bind(res);

    const toEnvelope = (payload, statusCode = res.statusCode || 200) => {
      const requestId = req.requestId || req.id || null;
      const timestamp = new Date().toISOString();
      const ok = statusCode >= 200 && statusCode < 400;

      // In non-breaking mode keep non-object payloads unchanged
      if (!isPlainObject(payload) && wrapOnlyPlainObjects) {
        return payload;
      }

      // Fallback wrapping for primitive/array payloads if explicitly enabled
      if (!isPlainObject(payload)) {
        return {
          success: ok,
          data: payload ?? null,
          error: ok ? null : "Request failed",
          message: null,
          requestId,
          timestamp,
        };
      }

      const message =
        typeof payload.message === "string" && payload.message.length > 0
          ? payload.message
          : null;

      const errorValue =
        typeof payload.error === "string" && payload.error.length > 0
          ? payload.error
          : ok
            ? null
            : "Request failed";

      const envelope = {
        success: ok,
        data: ok ? payload : null,
        error: errorValue,
        message,
        requestId,
        timestamp,
        ...payload,
      };

      return envelope;
    };

    // Helper for explicit standardized success responses
    res.apiSuccess = (payload = {}, statusCode = 200) => {
      res.status(statusCode);
      return originalJson(toEnvelope(payload, statusCode));
    };

    // Helper for explicit standardized error responses
    res.apiError = (error, statusCode = 500, details = null) => {
      const errorMessage =
        typeof error === "string" && error.trim() ? error : "Request failed";
      const payload = {
        error: errorMessage,
        ...(details && isPlainObject(details) ? details : {}),
      };
      res.status(statusCode);
      return originalJson(toEnvelope(payload, statusCode));
    };

    if (autoWrap) {
      res.json = (payload) => {
        if (res.locals.skipStandardization) {
          return originalJson.call(this, payload);
        }
        return originalJson(toEnvelope(payload, res.statusCode || 200));
      };
    }

    next();
  };
}

export default apiResponseStandardizer;
