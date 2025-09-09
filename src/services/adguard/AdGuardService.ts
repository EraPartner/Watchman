import { BaseService, ServiceHealth, ServiceStats } from '../base/BaseService';
import { logger } from '../../lib/logger';

// Based on AdGuard Home OpenAPI specification
export interface ServerStatus {
  dns_addresses: string[];
  dns_port: number;
  http_port: number;
  protection_enabled: boolean;
  protection_disabled_duration?: number;
  dhcp_available: boolean;
  running: boolean;
  version: string;
  language: string;
}

export interface Stats {
  time_units: 'hours' | 'days';
  num_dns_queries: number;
  num_blocked_filtering: number;
  num_replaced_safebrowsing: number;
  num_replaced_safesearch: number;
  num_replaced_parental: number;
  avg_processing_time: number;
  top_queried_domains: Array<{ [domain: string]: number }>;
  top_blocked_domains: Array<{ [domain: string]: number }>;
  top_clients: Array<{ [client: string]: number }>;
  top_upstreams_responses: Array<{ [upstream: string]: number }>;
  top_upstreams_avg_time: Array<{ [upstream: string]: number }>;
  dns_queries: number[];
  blocked_filtering: number[];
  replaced_safebrowsing: number[];
  replaced_parental: number[];
}

export class AdGuardService extends BaseService {
  
  async checkHealth(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${this.config.baseUrl}/api/adguard/status`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const status = await response.json() as ServerStatus;
      const responseTime = Date.now() - startTime;
      
      const health: ServiceHealth = {
        status: status.running ? 'online' : 'warning',
        responseTime,
        lastCheck: new Date(),
      };

      if (!status.protection_enabled) {
        health.status = 'warning';
        health.error = 'Protection is disabled';
      }

      // Only log connection success on first successful connection or after failures
      if (this.lastHealth.status === 'offline') {
        logger.info(`AdGuard Home connection established successfully`);
      }

      this.lastHealth = health;
      return health;
    } catch (error) {
      logger.error('AdGuard Home connection failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      const health: ServiceHealth = {
        status: 'offline',
        responseTime: Date.now() - startTime,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      this.lastHealth = health;
      return health;
    }
  }

  async getStats(): Promise<ServiceStats> {
    try {
      const [statusResponse, statsResponse] = await Promise.all([
        fetch(`${this.config.baseUrl}/api/adguard/status`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        }),
        fetch(`${this.config.baseUrl}/api/adguard/stats`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        })
      ]);

      if (!statusResponse.ok) {
        throw new Error(`Status endpoint HTTP ${statusResponse.status}: ${statusResponse.statusText}`);
      }
      if (!statsResponse.ok) {
        throw new Error(`Stats endpoint HTTP ${statsResponse.status}: ${statsResponse.statusText}`);
      }

      const status = await statusResponse.json() as ServerStatus;
      const stats = await statsResponse.json() as Stats;

      // Calculate blocking statistics according to AdGuard's logic
      const totalQueries = stats.num_dns_queries;
      const blockedQueries = stats.num_blocked_filtering + 
                           stats.num_replaced_safebrowsing + 
                           stats.num_replaced_safesearch + 
                           stats.num_replaced_parental;
      const allowedQueries = totalQueries - blockedQueries;
      const blockingRate = totalQueries > 0 ? (blockedQueries / totalQueries) * 100 : 0;

      // Extract top domain from the array format used by AdGuard
      const extractTopEntry = (topArray: Array<{ [key: string]: number }>, fallback = 'N/A'): string => {
        if (!topArray || topArray.length === 0) return fallback;
        const firstEntry = topArray[0];
        if (!firstEntry) return fallback;
        const key = Object.keys(firstEntry)[0];
        return key || fallback;
      };

      const processedStats = {
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
      
      return processedStats;
    } catch (error) {
      logger.error('AdGuard stats fetch failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(`Failed to fetch AdGuard stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Get detailed server status (matches /status endpoint)
  async getServerStatus(): Promise<ServerStatus> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/adguard/status`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        logger.error('AdGuard server status fetch failed:', errorMessage);
        throw new Error(errorMessage);
      }

      const result = await response.json() as ServerStatus;
      return result;
    } catch (error) {
      const errorMessage = `Failed to get server status: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logger.error('AdGuard getServerStatus() failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(errorMessage);
    }
  }

  // Get detailed statistics (matches /stats endpoint)
  async getDetailedStats(): Promise<Stats> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/adguard/stats`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        logger.error('AdGuard detailed stats fetch failed:', errorMessage);
        throw new Error(errorMessage);
      }

      const result = await response.json() as Stats;
      return result;
    } catch (error) {
      const errorMessage = `Failed to get detailed stats: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logger.error('AdGuard getDetailedStats() failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(errorMessage);
    }
  }

  // Toggle protection (matches /protection endpoint)
  async setProtection(enabled: boolean, duration?: number): Promise<void> {
    try {
      const body: { enabled: boolean; duration?: number } = { enabled };
      if (duration !== undefined) {
        body.duration = duration;
      }

      const response = await fetch(`${this.config.baseUrl}/api/adguard/protection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        logger.error('AdGuard protection toggle failed:', errorMessage);
        throw new Error(errorMessage);
      }

      logger.info(`AdGuard protection ${enabled ? 'enabled' : 'disabled'} successfully`);
    } catch (error) {
      const errorMessage = `Failed to set protection: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logger.error('AdGuard setProtection() failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(errorMessage);
    }
  }
}