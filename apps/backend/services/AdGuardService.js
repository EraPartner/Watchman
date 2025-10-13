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

  async checkHealth() {
    const startTime = Date.now();

    try {
      const headers = {
        "Content-Type": "application/json",
      };

      if (this.authToken) {
        headers["Authorization"] = `Basic ${this.authToken}`;
      }

      const response = await fetch(`${this.baseUrl}/control/status`, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const status = await response.json();
      const responseTime = Date.now() - startTime;

      const health = {
        status: status.running ? "online" : "warning",
        responseTime,
        lastCheck: new Date(),
        currentVersion: status.version || "unknown",
      };

      if (!status.protection_enabled) {
        health.status = "warning";
        health.error = "Protection is disabled";
      }

      return health;
    } catch (error) {
      return {
        status: "offline",
        responseTime: Date.now() - startTime,
        lastCheck: new Date(),
        error: error.message,
      };
    }
  }

  async getStats() {
    try {
      const headers = {
        "Content-Type": "application/json",
      };

      if (this.authToken) {
        headers["Authorization"] = `Basic ${this.authToken}`;
      }

      const [statusResponse, statsResponse] = await Promise.all([
        fetch(`${this.baseUrl}/control/status`, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(this.timeout),
        }),
        fetch(`${this.baseUrl}/control/stats`, {
          method: "GET",
          headers,
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

  async checkForUpdates() {
    try {
      const headers = {
        "Content-Type": "application/json",
      };

      if (this.authToken) {
        headers["Authorization"] = `Basic ${this.authToken}`;
      }

      const response = await fetch(`${this.baseUrl}/control/status`, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const status = await response.json();

      return {
        currentVersion: status.version || "unknown",
        updateAvailable: status.new_version ? true : false,
        latestVersion: status.new_version || status.version || "unknown",
        canAutoUpdate: status.can_autoupdate || false,
      };
    } catch (error) {
      throw new Error(`Failed to check for updates: ${error.message}`);
    }
  }
}

export { AdGuardService };
