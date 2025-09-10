const fetch = require('node-fetch');

class AdGuardService {
  constructor({ baseUrl, authToken, timeout = 10000 }) {
    this.baseUrl = baseUrl;
    this.authToken = authToken;
    this.timeout = timeout;
  }

  async checkHealth() {
    const startTime = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/control/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${this.authToken}`,
          'Content-Type': 'application/json',
        },
        timeout: this.timeout,
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        return {
          status: 'offline',
          responseTime,
          lastCheck: new Date(),
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      
      return {
        status: data.protection_enabled ? 'online' : 'warning',
        responseTime,
        lastCheck: new Date(),
        error: data.protection_enabled ? null : 'Protection disabled',
      };
    } catch (error) {
      return {
        status: 'offline',
        responseTime: Date.now() - startTime,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getStats() {
    try {
      const [statusResponse, statsResponse] = await Promise.all([
        fetch(`${this.baseUrl}/control/status`, {
          headers: { 'Authorization': `Basic ${this.authToken}` },
          timeout: this.timeout,
        }),
        fetch(`${this.baseUrl}/control/stats`, {
          headers: { 'Authorization': `Basic ${this.authToken}` },
          timeout: this.timeout,
        })
      ]);

      if (!statusResponse.ok || !statsResponse.ok) {
        throw new Error('Failed to fetch AdGuard data');
      }

      const [status, stats] = await Promise.all([
        statusResponse.json(),
        statsResponse.json()
      ]);

      return {
        protectionEnabled: status.protection_enabled,
        version: status.version,
        dnsQueries: stats.num_dns_queries,
        blockedFiltering: stats.num_blocked_filtering,
        blockedSafebrowsing: stats.num_blocked_safebrowsing,
        blockedParental: stats.num_blocked_parental,
        upstreamServers: status.dns_addresses,
        filteringEnabled: status.filtering_enabled,
        safebrowsingEnabled: status.safebrowsing_enabled,
        parentalEnabled: status.parental_enabled,
        blockingPercentage: stats.num_dns_queries > 0 
          ? ((stats.num_blocked_filtering / stats.num_dns_queries) * 100).toFixed(2)
          : 0,
      };
    } catch (error) {
      return { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}

module.exports = AdGuardService;