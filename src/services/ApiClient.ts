import { env } from '../lib/env';

// Simple API client that only talks to our backend
interface ServiceHealth {
  status: 'online' | 'offline' | 'warning' | 'not_configured';
  responseTime?: number;
  error?: string;
  lastCheck?: string;
}

interface AdGuardStats {
  // Server information
  version: string;
  running: boolean;
  protectionEnabled: boolean;
  dnsPort: number;
  httpPort: number;
  language: string;
  dhcpAvailable: boolean;
  
  // DNS Query statistics
  totalQueries: number;
  blockedQueries: number;
  allowedQueries: number;
  blockingRate: number;
  
  // Performance metrics
  avgProcessingTime: number;
  timeUnits: string;
  
  // Top lists
  topBlockedDomain: string;
  topQueriedDomain: string;
  topClient: string;
  
  // Additional stats
  safebrowsingBlocked: number;
  safesearchBlocked: number;
  parentalBlocked: number;
}

interface TorRelay {
  nickname: string;
  fingerprint: string;
  running: boolean;
  hibernating: boolean;
  flags: string[];
  country: string;
  city: string;
  first_seen: string;
  last_seen: string;
  consensus_weight: number;
  platform: string;
  contact: string;
  orPort: number;
  relayType: string;
  version: string;
  bandwidth: {
    current: number;
    average: number;
    burst: number;
  };
}

interface BitcoinStats {
  // Add relevant fields for Bitcoin stats
}

interface ServicesHealthResponse {
  timestamp: string;
  services: {
    adguard: ServiceHealth;
    tor: ServiceHealth;
  };
}

interface FrontendConfig {
  services: {
    adguard: {
      webUrl: string;
    };
    tor: {
      nickname?: string;
      ip?: string;
      port?: number;
      metricsUrl?: string;
    };
  };
  app: {
    name: string;
    version: string;
  };
}

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = env.getRequired('VITE_BACKEND_URL');
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        ...options,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `API request failed: ${response.status} ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`Network error: Cannot connect to backend at ${this.baseUrl}. Please check if the backend is running.`);
      }
      throw error;
    }
  }

  // AdGuard endpoints
  async getAdGuardStatus(): Promise<ServiceHealth> {
    return this.request('/api/adguard/status');
  }

  async getAdGuardStats(): Promise<AdGuardStats> {
    return this.request('/api/adguard/stats');
  }

  async setAdGuardProtection(enabled: boolean, duration?: number): Promise<{ success: boolean }> {
    return this.request('/api/adguard/protection', {
      method: 'POST',
      body: JSON.stringify({ enabled, duration }),
    });
  }

  // Bitcoin endpoints
  async getBitcoinStatus(): Promise<ServiceHealth> {
    return this.request('/api/bitcoin/status');
  }

  async getBitcoinStats(): Promise<BitcoinStats> {
    return this.request('/api/bitcoin/stats');
  }

  // Tor endpoints
  async getTorRelay(nickname?: string): Promise<TorRelay> {
    const endpoint = nickname ? `/api/tor/relay/${nickname}` : '/api/tor/relay';
    return this.request(endpoint);
  }

  async getTorHealth(): Promise<ServiceHealth> {
    return this.request('/api/tor/health');
  }

  // Health check
  async getServicesHealth(): Promise<ServicesHealthResponse> {
    return this.request('/api/services/health');
  }

  async getBackendHealth(): Promise<{ status: string; timestamp: string; service: string; version: string }> {
    return this.request('/health');
  }

  // Frontend configuration
  async getFrontendConfig(): Promise<FrontendConfig> {
    return this.request('/api/config/frontend');
  }
}

export const apiClient = new ApiClient();