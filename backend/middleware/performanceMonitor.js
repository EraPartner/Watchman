class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.requestCounts = new Map();
    this.responseTimes = new Map();
    this.errorCounts = new Map();
    this.startTime = Date.now();
    
    // Reset metrics every hour
    setInterval(() => this.resetHourlyMetrics(), 60 * 60 * 1000);
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
      default: return new Map();
    }
  }

  // Get performance statistics
  getStats() {
    const uptime = Date.now() - this.startTime;
    const memUsage = process.memoryUsage();
    
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
        total: Array.from(this.requestCounts.values()).reduce((a, b) => a + b, 0),
        byEndpoint: Object.fromEntries(this.requestCounts),
        rps: this.calculateRPS()
      },
      errors: {
        total: Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0),
        byEndpoint: Object.fromEntries(this.errorCounts),
        rate: this.calculateErrorRate()
      },
      performance: this.getPerformanceMetrics(),
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        cpuUsage: process.cpuUsage()
      }
    };
  }

  calculateRPS() {
    const totalRequests = Array.from(this.requestCounts.values()).reduce((a, b) => a + b, 0);
    const uptimeSeconds = (Date.now() - this.startTime) / 1000;
    return Math.round((totalRequests / uptimeSeconds) * 100) / 100;
  }

  calculateErrorRate() {
    const totalRequests = Array.from(this.requestCounts.values()).reduce((a, b) => a + b, 0);
    const totalErrors = Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0);
    return totalRequests > 0 ? Math.round((totalErrors / totalRequests) * 10000) / 100 : 0;
  }

  getPerformanceMetrics() {
    const metrics = {};
    
    for (const [endpoint, times] of this.responseTimes) {
      if (times.length > 0) {
        const sorted = [...times].sort((a, b) => a - b);
        metrics[endpoint] = {
          avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length * 100) / 100,
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
    console.log('📊 Resetting hourly performance metrics');
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
}

export default new PerformanceMonitor();