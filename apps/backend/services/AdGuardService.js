import { getAgentForUrl } from "../utils/httpAgentPool.js";

class AdGuardService {
  constructor(config) {
    this.baseUrl = config.baseUrl;

    // Handle both authToken and username/password authentication
    if (config.authToken) {
      this.authToken = config.authToken;
    } else if (config.username && config.password) {
      // Create Base64 encoded token from username:password
      const credentials = `${config.username}:${config.password}`;
      this.authToken = Buffer.from(credentials).toString("base64");
    } else {
      this.authToken = null;
    }

    this.timeout = config.timeout || 5000;
  }

  /**
   * Check AdGuard Home service health
   *
   * Performs a health check by querying the status endpoint.
   * Measures response time and validates service state.
   *
   * @returns {Promise<Object>} Health status object
   * @returns {string} returns.status - Service status: 'online', 'warning', 'offline'
   * @returns {number} returns.responseTime - Response time in milliseconds
   * @returns {Date} returns.lastCheck - Timestamp of health check
   * @returns {string} [returns.currentVersion] - AdGuard version if available
   * @returns {string} [returns.error] - Error message if health check failed
   */
  async checkHealth() {
    const startTime = Date.now();

    try {
      const headers = this.buildRequestHeaders();

      const response = await fetch(`${this.baseUrl}/control/status`, {
        method: "GET",
        headers,
        agent: getAgentForUrl(this.baseUrl),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(
          `HTTP ${response.status}: ${response.statusText} - ${errorText}`
        );
      }

      const status = await response.json();
      const responseTime = Date.now() - startTime;

      const health = {
        status: status.running ? "online" : "warning",
        responseTime,
        lastCheck: new Date(),
        currentVersion: status.version || "unknown",
      };

      // Check if protection is disabled
      if (!status.protection_enabled) {
        health.status = "warning";
        health.error = "DNS protection is disabled";
      }

      return health;
    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        status: "offline",
        responseTime,
        lastCheck: new Date(),
        error: this.sanitizeErrorMessage(error.message),
      };
    }
  }

  /**
   * Build common request headers for AdGuard API calls
   *
   * @returns {Object} Headers object with authentication if configured
   * @private
   */
  buildRequestHeaders() {
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "Watchman-Backend/1.0.0",
    };

    if (this.authToken) {
      headers["Authorization"] = `Basic ${this.authToken}`;
    }

    return headers;
  }

  /**
   * Sanitise error messages to prevent information disclosure
   *
   * @param {string} message - Raw error message
   * @returns {string} Sanitised error message
   * @private
   */
  sanitizeErrorMessage(message) {
    if (!message) return "Unknown error";

    // Remove potentially sensitive information
    return message
      .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "[IP]") // IP addresses
      .replace(/:\d+/g, ":[PORT]") // Port numbers
      .replace(/\/\/[^/]+/g, "//[HOST]") // Hostnames in URLs
      .substring(0, 200); // Limit length
  }

  async getStats() {
    try {
      const headers = this.buildRequestHeaders();

      const [statusResponse, statsResponse] = await Promise.all([
        fetch(`${this.baseUrl}/control/status`, {
          method: "GET",
          headers,
          agent: getAgentForUrl(this.baseUrl),
          signal: AbortSignal.timeout(this.timeout),
        }),
        fetch(`${this.baseUrl}/control/stats`, {
          method: "GET",
          headers,
          agent: getAgentForUrl(this.baseUrl),
          signal: AbortSignal.timeout(this.timeout),
        }),
      ]);

      if (!statusResponse.ok || !statsResponse.ok) {
        throw new Error(
          `API request failed: ${statusResponse.status} or ${statsResponse.status}`
        );
      }

      const status = await statusResponse.json();
      const stats = await statsResponse.json();

      // Calculate blocking statistics according to AdGuard's logic
      const totalQueries = stats.num_dns_queries;
      const blockedQueries =
        stats.num_blocked_filtering +
        stats.num_replaced_safebrowsing +
        stats.num_replaced_safesearch +
        stats.num_replaced_parental;
      const allowedQueries = totalQueries - blockedQueries;
      const blockingRate =
        totalQueries > 0 ? (blockedQueries / totalQueries) * 100 : 0;

      // Extract top domain from the array format used by AdGuard
      const extractTopEntry = (topArray, fallback = "N/A") => {
        if (!topArray || topArray.length === 0) return fallback;
        const firstEntry = topArray[0];
        if (!firstEntry) return fallback;
        const key = Object.keys(firstEntry)[0];
        return key || fallback;
      };

      return {
        // Server information
        version: status.version,
        running: status.running,
        protectionEnabled: status.protection_enabled,
        dnsPort: status.dns_port,
        httpPort: status.http_port,
        language: status.language,
        dhcpAvailable: status.dhcp_available,

        // DNS Query statistics
        totalQueries,
        blockedQueries,
        allowedQueries,
        blockingRate: Math.round(blockingRate * 100) / 100,

        // Performance metrics
        avgProcessingTime: stats.avg_processing_time,
        timeUnits: stats.time_units,

        // Top lists
        topBlockedDomain: extractTopEntry(stats.top_blocked_domains),
        topQueriedDomain: extractTopEntry(stats.top_queried_domains),
        topClient: extractTopEntry(stats.top_clients),

        // Additional stats
        safebrowsingBlocked: stats.num_replaced_safebrowsing,
        safesearchBlocked: stats.num_replaced_safesearch,
        parentalBlocked: stats.num_replaced_parental,
      };
    } catch (error) {
      throw new Error(`Failed to fetch AdGuard stats: ${error.message}`);
    }
  }

  async setProtection(enabled, duration) {
    try {
      const body = { enabled };
      if (duration !== undefined) {
        body.duration = duration;
      }

      const headers = {
        "Content-Type": "application/json",
      };

      if (this.authToken) {
        headers["Authorization"] = `Basic ${this.authToken}`;
      }

      const response = await fetch(`${this.baseUrl}/control/protection`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        agent: getAgentForUrl(this.baseUrl),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return { success: true };
    } catch (error) {
      throw new Error(`Failed to set protection: ${error.message}`);
    }
  }

  /**
   * Check for AdGuard Home updates
   *
   * Queries the status endpoint to check current version and update availability.
   *
   * @returns {Promise<Object>} Update information
   * @returns {string} returns.currentVersion - Currently installed version
   * @returns {boolean} returns.updateAvailable - Whether an update is available
   * @returns {string} [returns.latestVersion] - Latest available version if update exists
   * @throws {Error} If update check fails
   */
  async checkForUpdates() {
    try {
      const headers = this.buildRequestHeaders();

      const response = await fetch(`${this.baseUrl}/control/status`, {
        method: "GET",
        headers,
        agent: getAgentForUrl(this.baseUrl),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(
          `HTTP ${response.status}: ${response.statusText} - ${errorText}`
        );
      }

      const status = await response.json();

      return {
        currentVersion: status.version || "unknown",
        updateAvailable: Boolean(status.new_version),
        latestVersion: status.new_version || null,
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = this.sanitizeErrorMessage(error.message);
      throw new Error(`Failed to check for updates: ${errorMessage}`);
    }
  }
}

export { AdGuardService };
