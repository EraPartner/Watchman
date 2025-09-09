import { BaseService, ServiceHealth, ServiceStats } from '../base/BaseService';

export interface OnionooRelay {
  nickname: string;
  fingerprint: string;
  or_addresses: string[];
  running: boolean;
  flags: string[];
  first_seen: string;
  last_seen: string;
  bandwidth_burst?: number;
  observed_bandwidth?: number;
  consensus_weight?: number;
  country?: string;
  country_name?: string;
  city_name?: string;
  contact?: string;
  platform?: string;
  version?: string;
  hibernating?: boolean;
}

export interface OnionooResponse {
  relays: OnionooRelay[];
}

export class TorService extends BaseService {
  private relayNickname: string = 'torrelaytor';
  private onionooBaseUrl: string = 'https://onionoo.torproject.org';

  constructor() {
    super({
      name: 'Tor Relay',
      baseUrl: 'https://onionoo.torproject.org',
      timeout: 10000
    });
  }

  async checkHealth(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
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

      if (!relayInfo.running) {
        return {
          status: 'offline',
          responseTime,
          lastCheck: new Date(),
          error: `Relay "${this.relayNickname}" is not running`
        };
      }

      if (relayInfo.hibernating) {
        return {
          status: 'warning',
          responseTime,
          lastCheck: new Date(),
          error: `Relay "${this.relayNickname}" is hibernating`
        };
      }

      return {
        status: 'online',
        responseTime,
        lastCheck: new Date()
      };

    } catch (error) {
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
      const relayInfo = await this.searchRelayByNickname(this.relayNickname);
      
      if (!relayInfo) {
        return {
          nickname: this.relayNickname,
          status: 'Not Found',
          error: 'Relay not found in Tor network'
        };
      }

      return {
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
        orPort: this.extractORPort(relayInfo.or_addresses),
        relayType: this.determineRelayType(relayInfo.flags),
        version: relayInfo.version || relayInfo.platform || 'Unknown',
        bandwidth: {
          current: relayInfo.observed_bandwidth || 0,
          average: relayInfo.observed_bandwidth || 0,
          burst: relayInfo.bandwidth_burst || 0
        }
      };

    } catch (error) {
      return {
        nickname: this.relayNickname,
        status: 'Error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private extractORPort(addresses: string[]): number {
    for (const address of addresses) {
      const match = address.match(/:(\d+)$/);
      if (match) {
        return parseInt(match[1]);
      }
    }
    return 9001;
  }

  private determineRelayType(flags: string[]): string {
    if (flags.includes('Exit')) return 'exit';
    if (flags.includes('Guard')) return 'guard';
    if (flags.includes('Bridge')) return 'bridge';
    return 'relay';
  }

  private async searchRelayByNickname(nickname: string): Promise<OnionooRelay | null> {
    try {
      const url = `${this.onionooBaseUrl}/details?search=${encodeURIComponent(nickname)}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Onionoo API request failed: ${response.status} ${response.statusText}`);
      }

      const data: OnionooResponse = await response.json();
      
      if (!data.relays || data.relays.length === 0) {
        return null;
      }

      const exactMatch = data.relays.find(relay => 
        relay.nickname.toLowerCase() === nickname.toLowerCase()
      );

      return exactMatch || data.relays[0];

    } catch (error) {
      throw error;
    }
  }

  get nickname(): string {
    return this.relayNickname;
  }
}