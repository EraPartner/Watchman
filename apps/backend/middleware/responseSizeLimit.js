/**
 * Response Size Limit Middleware
 *
 * Prevents large response DoS attacks by limiting response size.
 * Wraps the response to track and limit data sent to clients.
 *
 * @fileoverview Response size limiting middleware
 * @author Watchman Team
 * @version 1.0.0
 */

import logger from "./logger.js";

/**
 * Create a response size limit middleware
 * @param {Object} options - Configuration options
 * @param {number} options.maxSize - Maximum response size in bytes (default: 5MB)
 * @param {string} options.errorMessage - Error message when limit exceeded
 * @returns {Function} Express middleware
 */
export function responseSizeLimit(options = {}) {
  const maxSize = options.maxSize || 5 * 1024 * 1024; // 5MB default
  const errorMessage = options.errorMessage || "Response too large";

  return (req, res, next) => {
    // Skip for health checks
    if (req.path === "/health") {
      return next();
    }

    let bytesWritten = 0;
    const originalWrite = res.write;
    const originalEnd = res.end;
    let limitExceeded = false;
    let bypassAccounting = false;

    const getChunkLength = (chunk, encoding) => {
      if (!chunk) return 0;
      if (Buffer.isBuffer(chunk)) return chunk.length;
      if (typeof chunk === "string") {
        return Buffer.byteLength(
          chunk,
          typeof encoding === "string" ? encoding : undefined
        );
      }
      return Buffer.byteLength(String(chunk));
    };

    const handleLimitExceeded = () => {
      if (limitExceeded) {
        if (res.socket && !res.socket.destroyed) {
          res.socket.destroy();
        }
        return;
      }

      limitExceeded = true;

      logger.warn("Response size limit exceeded", {
        method: req.method,
        path: req.path,
        size: bytesWritten,
        limit: maxSize,
        ip: req.ip,
      });

      if (!res.headersSent) {
        bypassAccounting = true;
        try {
          const payload = JSON.stringify({
            error: errorMessage,
            code: "RESPONSE_TOO_LARGE",
          });
          res.statusCode = 413;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          originalEnd.call(res, payload);
          return;
        } finally {
          bypassAccounting = false;
        }
      }

      if (res.socket && !res.socket.destroyed) {
        res.socket.destroy();
      }
    };

    const accountChunkAndCheckLimit = (chunk, encoding) => {
      if (bypassAccounting || limitExceeded) {
        return !limitExceeded;
      }

      bytesWritten += getChunkLength(chunk, encoding);
      if (bytesWritten > maxSize) {
        handleLimitExceeded();
        return false;
      }

      return true;
    };

    // Override write to track size
    res.write = function (chunk, encoding, callback) {
      if (!accountChunkAndCheckLimit(chunk, encoding)) {
        return false;
      }
      return originalWrite.apply(this, arguments);
    };

    // Override end to include final chunk in accounting
    res.end = function (chunk, encoding, callback) {
      if (!accountChunkAndCheckLimit(chunk, encoding)) {
        return this;
      }
      return originalEnd.apply(this, arguments);
    };

    next();
  };
}

// Export default middleware
export default responseSizeLimit({ maxSize: 5 * 1024 * 1024 });
