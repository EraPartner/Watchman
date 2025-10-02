import fs from "fs/promises";
import path from "path";

class MetricsStore {
  constructor() {
    this.dataDir = path.join(process.cwd(), "data");
    this.metricsFile = path.join(this.dataDir, "metrics.json");
    this.healthHistoryFile = path.join(this.dataDir, "health-history.json");
    this.maxHistoryDays = 7; // Keep 7 days of history

    this.initializeStorage();
  }

  async initializeStorage() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      console.log("📊 Metrics storage initialized");
    } catch (error) {
      console.error("Failed to initialize metrics storage:", error);
    }
  }

  // Store service health data with timestamp
  async recordHealthCheck(serviceName, healthData) {
    try {
      const timestamp = new Date().toISOString();
      const record = {
        timestamp,
        service: serviceName,
        status: healthData.status,
        responseTime: healthData.responseTime,
        error: healthData.error,
      };

      const history = await this.getHealthHistory();
      history.push(record);

      // Keep only last 7 days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.maxHistoryDays);

      const filteredHistory = history.filter(
        (record) => new Date(record.timestamp) > cutoffDate
      );

      await fs.writeFile(
        this.healthHistoryFile,
        JSON.stringify(filteredHistory, null, 2)
      );
    } catch (error) {
      console.error("Failed to record health check:", error);
    }
  }

  // Get historical health data
  async getHealthHistory(serviceName = null, hours = 24) {
    try {
      const data = await fs.readFile(this.healthHistoryFile, "utf8");
      let history = JSON.parse(data);

      // Filter by service if specified
      if (serviceName) {
        history = history.filter((record) => record.service === serviceName);
      }

      // Filter by time range
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - hours);

      return history.filter(
        (record) => new Date(record.timestamp) > cutoffDate
      );
    } catch (error) {
      return [];
    }
  }

  // Calculate service uptime percentage
  async getUptimeStats(serviceName, hours = 24) {
    const history = await this.getHealthHistory(serviceName, hours);

    if (history.length === 0) {
      return { uptime: 0, totalChecks: 0, onlineChecks: 0 };
    }

    const onlineChecks = history.filter(
      (record) => record.status === "online"
    ).length;
    const uptime = (onlineChecks / history.length) * 100;

    return {
      uptime: Math.round(uptime * 100) / 100,
      totalChecks: history.length,
      onlineChecks,
      avgResponseTime: this.calculateAverageResponseTime(history),
    };
  }

  calculateAverageResponseTime(history) {
    const validTimes = history
      .filter((record) => record.responseTime && record.status === "online")
      .map((record) => record.responseTime);

    if (validTimes.length === 0) return null;

    const avg =
      validTimes.reduce((sum, time) => sum + time, 0) / validTimes.length;
    return Math.round(avg * 100) / 100;
  }

  // Get service availability trends
  async getAvailabilityTrends(serviceName, hours = 24) {
    const history = await this.getHealthHistory(serviceName, hours);

    // Group by hour
    const hourlyData = {};
    history.forEach((record) => {
      const hour = new Date(record.timestamp).toISOString().substring(0, 13);
      if (!hourlyData[hour]) {
        hourlyData[hour] = { total: 0, online: 0 };
      }
      hourlyData[hour].total++;
      if (record.status === "online") {
        hourlyData[hour].online++;
      }
    });

    return Object.entries(hourlyData).map(([hour, data]) => ({
      hour,
      uptime: (data.online / data.total) * 100,
      checks: data.total,
    }));
  }

  // Store and retrieve performance metrics
  async storeMetrics(metrics) {
    try {
      const timestamp = new Date().toISOString();
      const record = { timestamp, ...metrics };

      await fs.writeFile(this.metricsFile, JSON.stringify(record, null, 2));
    } catch (error) {
      console.error("Failed to store metrics:", error);
    }
  }

  async getStoredMetrics() {
    try {
      const data = await fs.readFile(this.metricsFile, "utf8");
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  // Export data for external analysis
  async exportData(format = "json") {
    try {
      const health = await this.getHealthHistory();
      const metrics = await this.getStoredMetrics();

      const exportData = {
        exportTimestamp: new Date().toISOString(),
        healthHistory: health,
        metrics: metrics,
        summary: await this.generateSummaryReport(),
      };

      if (format === "csv") {
        return this.convertToCSV(health);
      }

      return exportData;
    } catch (error) {
      console.error("Failed to export data:", error);
      return null;
    }
  }

  convertToCSV(data) {
    if (data.length === 0) return "";

    const headers = Object.keys(data[0]).join(",");
    const rows = data.map((row) => Object.values(row).join(","));

    return [headers, ...rows].join("\n");
  }

  async generateSummaryReport() {
    const services = ["adguard", "bitcoin", "tor", "qbittorrent"];
    const report = {};

    for (const service of services) {
      const uptime = await this.getUptimeStats(service, 24);
      const trends = await this.getAvailabilityTrends(service, 24);

      report[service] = {
        uptime24h: uptime,
        hourlyTrends: trends.slice(-12), // Last 12 hours
      };
    }

    return report;
  }
}

export default new MetricsStore();
