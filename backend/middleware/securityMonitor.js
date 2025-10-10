// Real-time security monitoring and alerting
import logger from "./logger.js";
import { auditLogger } from "./auditLogger.js";

class SecurityMonitor {
  constructor() {
    this.alerts = [];
    this.maxAlerts = 1000; // Keep last 1000 alerts in memory
    this.thresholds = {
      failedLogins: { count: 5, window: 300000 }, // 5 in 5 minutes
      suspiciousPatterns: { count: 3, window: 60000 }, // 3 in 1 minute
      rateLimitHits: { count: 10, window: 300000 }, // 10 in 5 minutes
      unauthorizedAccess: { count: 3, window: 300000 }, // 3 in 5 minutes
    };

    this.events = new Map(); // Track events by type
    this.subscribers = new Map(); // Alert subscribers

    // Cleanup old events every 5 minutes
    setInterval(() => this.cleanup(), 300000);
  }

  trackEvent(type, metadata = {}) {
    const now = Date.now();
    const event = { timestamp: now, ...metadata };

    if (!this.events.has(type)) {
      this.events.set(type, []);
    }

    this.events.get(type).push(event);

    // Check if threshold exceeded
    this.checkThreshold(type);
  }

  checkThreshold(type) {
    const threshold = this.thresholds[type];
    if (!threshold) return;

    const events = this.events.get(type) || [];
    const now = Date.now();
    const recentEvents = events.filter(
      (e) => now - e.timestamp < threshold.window
    );

    if (recentEvents.length >= threshold.count) {
      this.raiseAlert({
        severity: "high",
        type: `threshold_exceeded_${type}`,
        message: `Security threshold exceeded: ${type}`,
        count: recentEvents.length,
        window: threshold.window / 1000 / 60 + " minutes",
        events: recentEvents,
      });
    }
  }

  raiseAlert(alert) {
    const timestamp = new Date().toISOString();
    const fullAlert = {
      id: this.generateAlertId(),
      timestamp,
      ...alert,
    };

    this.alerts.unshift(fullAlert);

    // Keep only recent alerts
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(0, this.maxAlerts);
    }

    // Log alert
    logger.error("SECURITY ALERT", fullAlert);
    auditLogger.logSecurityEvent(
      fullAlert.type,
      fullAlert.ip || "unknown",
      fullAlert.severity,
      fullAlert.message,
      fullAlert
    );

    // Notify subscribers
    this.notifySubscribers(fullAlert);

    // In production, you'd want to:
    // - Send emails
    // - Send webhooks
    // - Trigger PagerDuty/Opsgenie
    // - Update SIEM systems
  }

  notifySubscribers(alert) {
    for (const [id, callback] of this.subscribers.entries()) {
      try {
        callback(alert);
      } catch (error) {
        logger.error("Failed to notify subscriber", {
          id,
          error: error.message,
        });
      }
    }
  }

  subscribe(callback) {
    const id = this.generateAlertId();
    this.subscribers.set(id, callback);
    return () => this.subscribers.delete(id);
  }

  getAlerts(filters = {}) {
    let filtered = this.alerts;

    if (filters.severity) {
      filtered = filtered.filter((a) => a.severity === filters.severity);
    }

    if (filters.type) {
      filtered = filtered.filter((a) => a.type === filters.type);
    }

    if (filters.since) {
      const since = new Date(filters.since).getTime();
      filtered = filtered.filter(
        (a) => new Date(a.timestamp).getTime() >= since
      );
    }

    if (filters.limit) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  }

  cleanup() {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour

    for (const [type, events] of this.events.entries()) {
      const recent = events.filter((e) => now - e.timestamp < maxAge);
      if (recent.length === 0) {
        this.events.delete(type);
      } else {
        this.events.set(type, recent);
      }
    }
  }

  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getStats() {
    return {
      totalAlerts: this.alerts.length,
      eventTypes: Array.from(this.events.keys()),
      alertsByType: this.alerts.reduce((acc, alert) => {
        acc[alert.type] = (acc[alert.type] || 0) + 1;
        return acc;
      }, {}),
      alertsBySeverity: this.alerts.reduce((acc, alert) => {
        acc[alert.severity] = (acc[alert.severity] || 0) + 1;
        return acc;
      }, {}),
    };
  }
}

export const securityMonitor = new SecurityMonitor();

/**
 * Middleware to integrate with security monitor
 */
export function monitorSecurityEvents(req, res, next) {
  const originalStatus = res.status.bind(res);

  res.status = function (code) {
    // Track security-relevant status codes
    if (code === 401) {
      securityMonitor.trackEvent("unauthorizedAccess", {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userAgent: req.get("user-agent"),
      });
    } else if (code === 429) {
      securityMonitor.trackEvent("rateLimitHits", {
        ip: req.ip,
        path: req.path,
        method: req.method,
      });
    }

    return originalStatus(code);
  };

  next();
}

/**
 * Track failed login attempts
 */
export function trackFailedLogin(username, ip, metadata = {}) {
  securityMonitor.trackEvent("failedLogins", {
    username,
    ip,
    ...metadata,
  });
}

/**
 * Track suspicious patterns
 */
export function trackSuspiciousPattern(type, ip, metadata = {}) {
  securityMonitor.trackEvent("suspiciousPatterns", {
    type,
    ip,
    ...metadata,
  });
}
