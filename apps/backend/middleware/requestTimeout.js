/**
 * Request Timeout Middleware
 *
 * Applies global timeout to all API requests to prevent hanging requests.
 * Uses Express res.writeHead to ensure timeout response is sent properly.
 *
 * @fileoverview Global request timeout middleware
 * @author Watchman Team
 * @version 1.0.0
 */

import logger from "./logger.js";

/**
 * Create a timeout middleware with configurable timeout
 * @param {Object} options - Configuration options
 * @param {number} options.timeout - Timeout in milliseconds (default: 30000ms)
 * @param {string} options.timeoutMessage - Error message on timeout
 * @returns {Function} Express middleware
 */
export function requestTimeout(options = {}) {
  const timeout = options.timeout || 30000; // 30 seconds default
  const timeoutMessage = options.timeoutMessage || "Request timeout";

  return (req, res, next) => {
    // Don't timeout for health checks (they should be fast)
    if (req.path === "/health") {
      return next();
    }

    const abortController = new AbortController();
    req.requestAbortController = abortController;
    req.requestAbortSignal = abortController.signal;
    let requestFinished = false;

    const timer = setTimeout(() => {
      abortController.abort(new Error("Request timed out"));

      logger.warn("Request timeout", {
        method: req.method,
        path: req.path,
        timeout: timeout,
        ip: req.ip,
      });

      // Only send response if headers haven't been sent
      if (!res.headersSent) {
        res.status(503).json({
          error: timeoutMessage,
          code: "TIMEOUT",
          timeout: timeout,
        });
      }
    }, timeout);

    // Clear timeout when response finishes
    res.on("finish", () => {
      requestFinished = true;
      clearTimeout(timer);
    });

    // Also clear on close (client disconnect)
    res.on("close", () => {
      if (!requestFinished) {
        abortController.abort(new Error("Client disconnected"));
      }
      clearTimeout(timer);
    });

    next();
  };
}

// Export default timeout of 30 seconds for all API routes
export default requestTimeout({ timeout: 30000 });
