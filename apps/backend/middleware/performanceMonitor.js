import logger from "./logger.js";
import crypto from "crypto";

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.requestCounts = new Map();
    this.responseTimes = new Map();
    this.errorCounts = new Map();
    this.startTime = Date.now();
    this.SLOW_REQUEST_THRESHOLD = 2000;
    this.HIGH_ERROR_RATE_THRESHOLD = 10;

    // Maximum number of response time samples to keep per endpoint
    // Prevents unbounded memory growth with many endpoints
    this.MAX_SAMPLES_PER_ENDPOINT = 100;

    // Maximum number of endpoints to track
    // If exceeded, oldest endpoints are pruned
    this.MAX_ENDPOINTS = 500;

    // Keep reference to interval so it can be cleared on shutdown
    this._hourlyResetInterval = setInterval(
      () => this.resetHourlyMetrics(),
      60 * 60 * 1000
    );
    this._hourlyResetInterval.unref();
  }

  /**
   * Middleware to track request performance and generate alerts
   *
   * Measures response times, tracks request counts, and monitors
   * error rates with automatic alerting for performance issues.
   *
   * @returns {Function} Express middleware function
   */
  trackRequest() {
    return (req, res, next) => {
      // Skip health endpoint to avoid noise
      if (req.path === "/health") return next();

      const startTime = process.hrtime.bigint();
      const endpoint = this.normalizeEndpoint(req);
      const requestId = req.id || this.generateRequestId();

      // Track request count
      this.incrementCounter("requests", endpoint);

      // Track response when finished
      res.on("finish", () => {
        try {
          const durationMs =
            Number(process.hrtime.bigint() - startTime) / 1000000;
          this.recordResponseTime(endpoint, durationMs);

          // Track errors
          if (res.statusCode >= 400) {
            this.incrementCounter("errors", endpoint);
          }

          // Check for performance issues and log warnings
          this.checkPerformanceThresholds(
            endpoint,
            durationMs,
            res.statusCode,
            requestId
          );
        } catch (error) {
          logger.warn("Performance tracking error:", error.message);
        }
      });

      next();
    };
  }

  /**
   * Normalize endpoint path for consistent tracking
   *
   * @param {Object} req - Express request object
   * @returns {string} Normalized endpoint identifier
   * @private
   */
  normalizeEndpoint(req) {
    const method = req.method;
    const path = req.route?.path || req.path;

    // Normalize dynamic segments for consistent tracking
    const normalizedPath = path
      .replace(/\/\d+/g, "/:id") // Replace numeric IDs
      .replace(/\/[a-f0-9-]{36}/g, "/:uuid") // Replace UUIDs
      .replace(/\/[a-zA-Z0-9_-]+_\d+/g, "/:instance"); // Replace service instances

    return `${method} ${normalizedPath}`;
  }

  /**
   * Generate unique request ID for tracking
   *
   * @returns {string} Request identifier
   * @private
   */
  generateRequestId() {
    return `req_${crypto.randomUUID()}`;
  }

  /**
   * Check performance thresholds and emit warnings
   *
   * @param {string} endpoint - Endpoint identifier
   * @param {number} duration - Request duration in milliseconds
   * @param {number} statusCode - HTTP status code
   * @param {string} requestId - Request identifier
   * @private
   */
  checkPerformanceThresholds(endpoint, duration, statusCode, requestId) {
    // Check for slow requests
    if (duration > this.SLOW_REQUEST_THRESHOLD) {
      logger.warn(`Slow request detected`, {
        endpoint,
        duration: `${duration.toFixed(2)}ms`,
        threshold: `${this.SLOW_REQUEST_THRESHOLD}ms`,
        requestId,
        statusCode,
      });
    }

    // Check error rate (if we have enough samples)
    const totalRequests = this.requestCounts.get(endpoint) || 0;
    const totalErrors = this.errorCounts.get(endpoint) || 0;

    if (totalRequests >= 10) {
      // Only check after sufficient requests
      const errorRate = (totalErrors / totalRequests) * 100;

      if (errorRate > this.HIGH_ERROR_RATE_THRESHOLD) {
        logger.warn(`High error rate detected`, {
          endpoint,
          errorRate: `${errorRate.toFixed(1)}%`,
          threshold: `${this.HIGH_ERROR_RATE_THRESHOLD}%`,
          totalRequests,
          totalErrors,
        });
      }
    }
  }

  incrementCounter(type, key) {
    const map = this.getCounterMap(type);
    map.set(key, (map.get(key) || 0) + 1);
  }

  recordResponseTime(endpoint, duration) {
    if (!this.responseTimes.has(endpoint)) {
      this.responseTimes.set(endpoint, []);
    }

    const times = this.responseTimes.get(endpoint);
    times.push(duration);

    // Keep only last N measurements per endpoint to prevent memory leaks
    if (times.length > this.MAX_SAMPLES_PER_ENDPOINT) {
      times.shift();
    }

    // Prune old endpoints if we exceed max tracked endpoints
    if (this.responseTimes.size > this.MAX_ENDPOINTS) {
      const firstKey = this.responseTimes.keys().next().value;
      this.responseTimes.delete(firstKey);
      this.requestCounts.delete(firstKey);
      this.errorCounts.delete(firstKey);
    }
  }

  getCounterMap(type) {
    switch (type) {
      case "requests":
        return this.requestCounts;
      case "errors":
        return this.errorCounts;
      default:
        return this.requestCounts; // fallback to requests map to avoid allocations
    }
  }

  // Get performance statistics
  getStats() {
    const uptime = Date.now() - this.startTime;
    const memUsage = process.memoryUsage();

    let totalRequests = 0;
    for (const count of this.requestCounts.values()) {
      totalRequests += count;
    }
    let totalErrors = 0;
    for (const count of this.errorCounts.values()) {
      totalErrors += count;
    }

    const requestCountsObj = {};
    for (const [k, v] of this.requestCounts) {
      requestCountsObj[k] = v;
    }
    const errorCountsObj = {};
    for (const [k, v] of this.errorCounts) {
      errorCountsObj[k] = v;
    }

    return {
      uptime: {
        ms: uptime,
        human: this.formatUptime(uptime),
      },
      memory: {
        used: Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100,
        total: Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100,
        external: Math.round((memUsage.external / 1024 / 1024) * 100) / 100,
        rss: Math.round((memUsage.rss / 1024 / 1024) * 100) / 100,
      },
      requests: {
        total: totalRequests,
        byEndpoint: requestCountsObj,
        rps: this.calculateRPS(totalRequests, uptime),
      },
      errors: {
        total: totalErrors,
        byEndpoint: errorCountsObj,
        rate: this.calculateErrorRate(totalRequests, totalErrors),
      },
      performance: this.getPerformanceMetrics(),
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        cpuUsage: process.cpuUsage(),
      },
    };
  }

  calculateRPS(totalRequests, uptimeMs) {
    const uptimeSeconds = uptimeMs / 1000;
    return uptimeSeconds > 0
      ? Math.round((totalRequests / uptimeSeconds) * 100) / 100
      : 0;
  }

  calculateErrorRate(totalRequests, totalErrors) {
    return totalRequests > 0
      ? Math.round((totalErrors / totalRequests) * 10000) / 100
      : 0;
  }

  getPerformanceMetrics() {
    const metrics = {};

    for (const [endpoint, times] of this.responseTimes) {
      if (times && times.length > 0) {
        const sorted = [...times].sort((a, b) => a - b);
        const sum = times.reduce((a, b) => a + b, 0);
        const avg = Math.round((sum / times.length) * 100) / 100;
        metrics[endpoint] = {
          avg,
          min:
            Math.round(
              times.reduce((a, b) => (a < b ? a : b), Infinity) * 100
            ) / 100,
          max:
            Math.round(
              times.reduce((a, b) => (a > b ? a : b), -Infinity) * 100
            ) / 100,
          p50: Math.round(sorted[Math.floor(sorted.length * 0.5)] * 100) / 100,
          p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 100) / 100,
          p99: Math.round(sorted[Math.floor(sorted.length * 0.99)] * 100) / 100,
          samples: times.length,
        };
      }
    }

    return metrics;
  }

  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  resetHourlyMetrics() {
    logger.info("Performance metrics hourly reset initiated");
    this.requestCounts.clear();
    this.errorCounts.clear();
    this.responseTimes.clear();
  }

  // Health check based on performance metrics
  getHealthStatus() {
    const stats = this.getStats();
    const issues = [];

    // Check memory usage
    if (stats.memory.used > 500) {
      issues.push(`High memory usage: ${stats.memory.used}MB`);
    }

    // Check error rate
    if (stats.errors.rate > 5) {
      issues.push(`High error rate: ${stats.errors.rate}%`);
    }

    // Check response times
    for (const [endpoint, metrics] of Object.entries(stats.performance)) {
      if (metrics.avg > 1000) {
        issues.push(`Slow endpoint ${endpoint}: ${metrics.avg}ms avg`);
      }
    }

    return {
      status:
        issues.length === 0
          ? "healthy"
          : issues.length < 3
            ? "warning"
            : "critical",
      issues,
      metrics: {
        uptime: stats.uptime.human,
        memoryUsage: `${stats.memory.used}MB`,
        requestRate: `${stats.requests.rps} RPS`,
        errorRate: `${stats.errors.rate}%`,
      },
    };
  }

  // Shutdown monitor (clear intervals)
  shutdown() {
    if (this._hourlyResetInterval) {
      clearInterval(this._hourlyResetInterval);
      this._hourlyResetInterval = null;
      logger.success("Performance monitor shutdown complete");
    }
  }
}

export default new PerformanceMonitor();
