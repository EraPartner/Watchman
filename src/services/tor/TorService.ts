import { BaseService, ServiceHealth, ServiceStats } from '../base/BaseService';

export interface OnionooRelay {
  nickname: string;
  fingerprint: string;
  hashed_fingerprint: string;
  addresses: string[];
  or_addresses: string[];  // This is the correct field for OR addresses from Onionoo API
  or_port?: number;
  dir_port?: number;
  running: boolean;
  flags: string[];
  first_seen: string;
  last_seen: string;
  last_changed_address_or_port: string;
  bandwidth_rate?: number;
  bandwidth_burst?: number;
  observed_bandwidth?: number;
  advertised_bandwidth?: number;
  consensus_weight?: number;
  country?: string;
  country_name?: string;
  region_name?: string;
  city_name?: string;
  latitude?: number;
  longitude?: number;
  as_name?: string;
  as_number?: string;
  contact?: string;
  platform?: string;
  version?: string;
  version_status?: string;
  effective_family?: string[];
  alleged_family?: string[];
  indirect_family?: string[];
  hibernating?: boolean;
  unreachable_or_addresses?: string[];
}

export interface OnionooResponse {
  version: string;
  next_major_version_scheduled?: string;
  build_revision: string;
  relays_published: string;
  relays_truncated?: number;
  relays: OnionooRelay[];
  bridges_published?: string;
  bridges_truncated?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bridges?: any[];
}

export interface BandwidthHistory {
  first: string;
  last: string;
  interval: number;
  factor: number;
  count: number;
  values: number[];
}

export interface OnionooDetailResponse extends OnionooResponse {
  relays: Array<OnionooRelay & {
    write_history?: BandwidthHistory;
    read_history?: BandwidthHistory;
  }>;
}

export class TorService extends BaseService {
  private torNodeIP: string;
  private torControlPort: number;
  private relayFingerprint?: string;
  private relayNickname: string = 'torrelaytor';
  private onionooBaseUrl: string = 'https://onionoo.torproject.org';

  constructor(nodeIP: string = '192.168.0.143', controlPort: number = 56234, fingerprint?: string) {
    super({
      name: 'Tor Relay',
      baseUrl: `http://${nodeIP}:${controlPort}`,
      timeout: 10000
    });
    
    this.torNodeIP = nodeIP;
    this.torControlPort = controlPort;
    this.relayFingerprint = fingerprint;
  }

  async checkHealth(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      console.log(`🔍 Checking Tor relay health for nickname "${this.relayNickname}"`);
      
      // Search for the relay using Onionoo API
      const relayInfo = await this.searchRelayByNickname(this.relayNickname);
      const responseTime = Date.now() - startTime;
      
      if (!relayInfo) {
        return {
          status: 'offline',
          responseTime,
          lastCheck: new Date(),
          error: `Relay with nickname "${this.relayNickname}" not found in Tor network`
        };
      }

      // Check if the relay is running
      if (!relayInfo.running) {
        return {
          status: 'offline',
          responseTime,
          lastCheck: new Date(),
          error: `Relay "${this.relayNickname}" is not running`
        };
      }

      // Check if hibernating
      if (relayInfo.hibernating) {
        return {
          status: 'warning',
          responseTime,
          lastCheck: new Date(),
          error: `Relay "${this.relayNickname}" is hibernating`
        };
      }

      // Relay is healthy
      return {
        status: 'online',
        responseTime,
        lastCheck: new Date()
      };

    } catch (error) {
      console.error('❌ Tor relay health check failed:', error);
      return {
        status: 'offline',
        responseTime: Date.now() - startTime,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getStats(): Promise<ServiceStats> {
    try {
      console.log(`🔍 Fetching Tor relay stats for nickname "${this.relayNickname}" via Onionoo API`);
      
      const relayInfo = await this.searchRelayByNickname(this.relayNickname);
      
      console.log('📡 Onionoo API stats response received');
      
      if (!relayInfo) {
        console.log(`⚠️ No relay data found for stats collection`);
        return {
          nickname: this.relayNickname,
          status: 'Not Found',
          error: 'Relay not found in Tor network'
        };
      }

      // Extract OR port from or_addresses (not addresses)
      const orPort = this.extractORPort(relayInfo.or_addresses || []);
      
      // Determine relay type from flags
      const relayType = this.determineRelayType(relayInfo.flags);

      const stats = {
        nickname: relayInfo.nickname,
        fingerprint: relayInfo.fingerprint.substring(0, 8) + '...',
        running: relayInfo.running,
        hibernating: relayInfo.hibernating || false,
        flags: relayInfo.flags,
        country: relayInfo.country_name || relayInfo.country || 'Unknown',
        city: relayInfo.city_name || 'Unknown',
        first_seen: relayInfo.first_seen,
        last_seen: relayInfo.last_seen,
        consensus_weight: relayInfo.consensus_weight || 0,
        platform: relayInfo.platform || 'Unknown',
        contact: relayInfo.contact || 'No contact info',
        orPort: orPort,
        relayType: relayType,
        version: relayInfo.version || relayInfo.platform || 'Unknown',
        // Real bandwidth data from Onionoo API
        bandwidth: {
          current: relayInfo.observed_bandwidth || 0,
          average: relayInfo.observed_bandwidth || 0,
          burst: relayInfo.bandwidth_burst || relayInfo.observed_bandwidth || 0
        },
        // Note: Onionoo doesn't provide connection/circuit data - these would need local Tor control port access
        connections: {
          current: 0,
          total: 0
        },
        circuits: {
          active: 0,
          total: 0
        }
      };

      console.log('📊 Tor Stats Response:', JSON.stringify({
        nickname: stats.nickname,
        fingerprint: stats.fingerprint,
        running: stats.running,
        hibernating: stats.hibernating,
        orPort: stats.orPort,
        relayType: stats.relayType,
        bandwidth: stats.bandwidth,
        location: `${stats.city}, ${stats.country}`
      }, null, 2));

      console.log('✅ Tor Stats Collection Result: Success');
      return stats;

    } catch (error) {
      console.error('❌ Tor Stats Collection Failed:', {
        nickname: this.relayNickname,
        url: `${this.onionooBaseUrl}/details?search=${encodeURIComponent(this.relayNickname)}`,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      return {
        nickname: this.relayNickname,
        status: 'Error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Extract OR port from relay addresses
   */
  private extractORPort(addresses: string[]): number {
    for (const address of addresses) {
      // Addresses are in format "IP:PORT" or "[IPv6]:PORT"
      const match = address.match(/:(\d+)$/);
      if (match) {
        return parseInt(match[1]);
      }
    }
    return 9001; // Default OR port
  }

  /**
   * Determine relay type based on flags
   */
  private determineRelayType(flags: string[]): string {
    if (flags.includes('Exit')) return 'exit';
    if (flags.includes('Guard')) return 'guard';
    if (flags.includes('Bridge')) return 'bridge';
    return 'relay';
  }

  /**
   * Search for a Tor relay by nickname using the Onionoo API
   */
  async searchRelayByNickname(nickname: string): Promise<OnionooRelay | null> {
    try {
      const url = `${this.onionooBaseUrl}/details?search=${encodeURIComponent(nickname)}`;
      console.log(`🔍 Searching for relay "${nickname}" via Onionoo API: ${url}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Onionoo API request failed: ${response.status} ${response.statusText}`);
      }

      const data: OnionooDetailResponse = await response.json();
      
      if (!data.relays || data.relays.length === 0) {
        console.log(`⚠️ No relays found with nickname "${nickname}"`);
        return null;
      }

      // Find exact nickname match (case-insensitive)
      const exactMatch = data.relays.find(relay => 
        relay.nickname.toLowerCase() === nickname.toLowerCase()
      );

      if (exactMatch) {
        console.log(`✅ Found exact match for relay "${nickname}":`, {
          nickname: exactMatch.nickname,
          fingerprint: exactMatch.fingerprint,
          running: exactMatch.running,
          flags: exactMatch.flags
        });
        return exactMatch;
      }

      // If no exact match, return the first result
      const firstMatch = data.relays[0];
      console.log(`⚠️ No exact match found, returning first result:`, {
        searched: nickname,
        found: firstMatch.nickname,
        fingerprint: firstMatch.fingerprint
      });
      
      return firstMatch;

    } catch (error) {
      console.error(`❌ Failed to search for relay "${nickname}":`, error);
      throw error;
    }
  }

  /**
   * Get detailed information about the relay including bandwidth history
   */
  async getRelayDetails(fingerprint?: string): Promise<OnionooRelay | null> {
    try {
      const searchParam = fingerprint || this.relayNickname;
      const url = `${this.onionooBaseUrl}/details?search=${encodeURIComponent(searchParam)}`;
      
      console.log(`📊 Getting detailed info for relay: ${url}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Onionoo API request failed: ${response.status} ${response.statusText}`);
      }

      const data: OnionooDetailResponse = await response.json();
      
      if (!data.relays || data.relays.length === 0) {
        return null;
      }

      return data.relays[0];

    } catch (error) {
      console.error('❌ Failed to get relay details:', error);
      throw error;
    }
  }

  // Getters for accessing private properties
  get nickname(): string {
    return this.relayNickname;
  }

  get nodeIP(): string {
    return this.torNodeIP;
  }

  get controlPort(): number {
    return this.torControlPort;
  }

  get fingerprint(): string | undefined {
    return this.relayFingerprint;
  }

  // Setter to update nickname if needed
  setNickname(nickname: string): void {
    this.relayNickname = nickname;
  }
}