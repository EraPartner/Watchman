class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.requestCounts = new Map();
    this.responseTimes = new Map();
    this.errorCounts = new Map();
    this.startTime = Date.now();

    // Keep reference to interval so it can be cleared on shutdown
    this._hourlyResetInterval = setInterval(() => this.resetHourlyMetrics(), 60 * 60 * 1000);
  }

  // Middleware to track request performance
  trackRequest() {
    return (req, res, next) => {
      const startTime = process.hrtime.bigint();
      const endpoint = `${req.method} ${req.route?.path || req.path}`;

      // Track request count
      this.incrementCounter('requests', endpoint);

      // Track response when finished
      res.on('finish', () => {
        const duration = Number(process.hrtime.bigint() - startTime) / 1000000; // Convert to ms
        this.recordResponseTime(endpoint, duration);

        if (res.statusCode >= 400) {
          this.incrementCounter('errors', endpoint);
        }
      });

      next();
    };
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

    // Keep only last 100 measurements per endpoint
    if (times.length > 100) {
      times.shift();
    }
  }

  getCounterMap(type) {
    switch (type) {
      case 'requests': return this.requestCounts;
      case 'errors': return this.errorCounts;
      default: return this.requestCounts; // fallback to requests map to avoid allocations
    }
  }

  // Get performance statistics
  getStats() {
    const uptime = Date.now() - this.startTime;
    const memUsage = process.memoryUsage();

    const totalRequests = Array.from(this.requestCounts.values()).reduce((a, b) => a + b, 0);
    const totalErrors = Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0);

    return {
      uptime: {
        ms: uptime,
        human: this.formatUptime(uptime)
      },
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
        total: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
        external: Math.round(memUsage.external / 1024 / 1024 * 100) / 100,
        rss: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100
      },
      requests: {
        total: totalRequests,
        byEndpoint: Object.fromEntries(this.requestCounts),
        rps: this.calculateRPS(totalRequests, uptime)
      },
      errors: {
        total: totalErrors,
        byEndpoint: Object.fromEntries(this.errorCounts),
        rate: this.calculateErrorRate(totalRequests, totalErrors)
      },
      performance: this.getPerformanceMetrics(),
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        cpuUsage: process.cpuUsage()
      }
    };
  }

  calculateRPS(totalRequests, uptimeMs) {
    const uptimeSeconds = uptimeMs / 1000;
    return uptimeSeconds > 0 ? Math.round((totalRequests / uptimeSeconds) * 100) / 100 : 0;
  }

  calculateErrorRate(totalRequests, totalErrors) {
    return totalRequests > 0 ? Math.round((totalErrors / totalRequests) * 10000) / 100 : 0;
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
          min: Math.round(Math.min(...times) * 100) / 100,
          max: Math.round(Math.max(...times) * 100) / 100,
          p50: Math.round(sorted[Math.floor(sorted.length * 0.5)] * 100) / 100,
          p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 100) / 100,
          p99: Math.round(sorted[Math.floor(sorted.length * 0.99)] * 100) / 100,
          samples: times.length
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
    console.info('📊 Resetting hourly performance metrics');
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
      status: issues.length === 0 ? 'healthy' : issues.length < 3 ? 'warning' : 'critical',
      issues,
      metrics: {
        uptime: stats.uptime.human,
        memoryUsage: `${stats.memory.used}MB`,
        requestRate: `${stats.requests.rps} RPS`,
        errorRate: `${stats.errors.rate}%`
      }
    };
  }

  // Shutdown monitor (clear intervals)
  shutdown() {
    if (this._hourlyResetInterval) {
      clearInterval(this._hourlyResetInterval);
      this._hourlyResetInterval = null;
      console.info('📊 Performance monitor shutdown complete');
    }
  }
}

export default new PerformanceMonitor();