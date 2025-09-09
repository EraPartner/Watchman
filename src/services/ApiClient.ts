// Simple API client that only talks to our backend
interface ServiceHealth {
  status: 'online' | 'offline' | 'warning' | 'not_configured';
  responseTime?: string;
  error?: string;
  timestamp?: string;
}

interface AdGuardStats {
  num_dns_queries: number;
  num_blocked_filtering: number;
  num_replaced_safebrowsing: number;
  num_replaced_safesearch: number;
  num_replaced_parental: number;
  avg_processing_time: number;
  protection_enabled: boolean;
  running: boolean;
  version: string;
  dns_addresses: string[];
  dns_port: number;
  http_port: number;
  https_port: number;
  bootstrap_dns: string[];
  upstream_dns: string[];
}

interface TorRelay {
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
    this.baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
  }

  private async request<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // AdGuard endpoints
  async getAdGuardStatus(): Promise<any> {
    return this.request('/api/adguard/status');
  }

  async getAdGuardStats(): Promise<AdGuardStats> {
    return this.request<AdGuardStats>('/api/adguard/stats');
  }

  // Tor endpoints
  async getTorRelay(nickname?: string): Promise<TorRelay> {
    const endpoint = nickname ? `/api/tor/relay/${nickname}` : '/api/tor/relay/default';
    return this.request(endpoint);
  }

  async getTorBandwidth(fingerprint: string): Promise<any> {
    return this.request(`/api/tor/bandwidth/${fingerprint}`);
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