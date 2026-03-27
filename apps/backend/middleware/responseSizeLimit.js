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
    const originalEnd = res.writeHead;

    // Override write to track size
    res.write = function (chunk, encoding, callback) {
      if (chunk) {
        const chunkLength = Buffer.isBuffer(chunk)
          ? chunk.length
          : Buffer.byteLength(chunk);
        bytesWritten += chunkLength;

        if (bytesWritten > maxSize) {
          logger.warn("Response size limit exceeded", {
            method: req.method,
            path: req.path,
            size: bytesWritten,
            limit: maxSize,
            ip: req.ip,
          });

          // Close the connection if too much data was sent
          if (!res.headersSent) {
            res.status(413).json({
              error: errorMessage,
              code: "RESPONSE_TOO_LARGE",
            });
          }
          // Destroy the socket to stop further data
          if (res.socket) {
            res.socket.destroy();
          }
          return false;
        }
      }
      return originalWrite.apply(this, arguments);
    };

    next();
  };
}

// Export default middleware
export default responseSizeLimit({ maxSize: 5 * 1024 * 1024 });
