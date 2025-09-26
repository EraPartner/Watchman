import { env } from '../lib/env';
import { APP_CONFIG } from '../lib/constants';

// Simple API client that only talks to our backend
export interface ServiceHealth {
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

interface RoonPortCheck {
  port: number;
  open: boolean;
}

interface RoonStatus {
  status: 'online' | 'offline' | 'error';
  timestamp: string;
  data?: {
    host?: string;
    ping?: boolean | null;
    ports?: RoonPortCheck[];
  };
  error?: string;
}

interface BitcoinStats {
  // Bitcoin stats fields - will be populated when BitcoinCard is updated
  version?: string;
  blocks?: number;
  uptime?: number;
  // Optional on-disk size of the blockchain (bytes)
  blockchainSize?: number;
}

interface QBittorrentStats {
  version: string;
  uptime: number;
  torrents: {
    total: number;
    downloading: number;
    seeding: number;
    paused: number;
    completed: number;
  };
  transfer: {
    dlSpeed: number;
    upSpeed: number;
    dlData: number;
    upData: number;
    dlSession: number;
    upSession: number;
  };
  connection: {
    status: string;
    port: number;
    dhtNodes: number;
  };
  freeSpaceOnDisk: number;
}

interface ServicesHealthResponse {
  timestamp: string;
  services: {
    adguard: ServiceHealth;
    tor: ServiceHealth;
  };
}

export interface FrontendConfig {
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
    roon?: {
      host?: string | null;
      ports?: string | null;
      configured?: boolean;
    };
    // optional entries used by UI components
    qbittorrent?: {
      host?: string | null;
      webPort?: number | null;
    };
    synology?: {
      host?: string | null;
      webPort?: number | null;
    };
  };
  app: {
    name: string;
    version: string;
  };
}

class ApiClient {
  private baseUrl: string;
  // Map to deduplicate concurrent identical requests
  private inFlightRequests: Map<string, Promise<any>> = new Map();

  constructor() {
    this.baseUrl = env.getRequired('VITE_BACKEND_URL');
  }

  private makeRequestKey(url: string, options?: RequestInit) {
    const method = (options && options.method) ? String(options.method).toUpperCase() : 'GET';
    let bodyKey = '';
    try {
      if (options && options.body != null) {
        bodyKey = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      }
    } catch (e) {
      bodyKey = String(options && (options as any).body);
    }
    return `${method} ${url} ${bodyKey}`;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const key = this.makeRequestKey(url, options);
    if (this.inFlightRequests.has(key)) {
      // Reuse in-flight promise
      return this.inFlightRequests.get(key) as Promise<T>;
    }

    const controller = new AbortController();
    const timeoutMs = APP_CONFIG.API_TIMEOUT || 10000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    // Merge headers safely
    const headers = Object.assign({ 'Content-Type': 'application/json' }, (options && options.headers) || {});

    const fetchOptions: RequestInit = Object.assign({}, options, {
      headers,
      credentials: 'include',
      signal: controller.signal
    });

    const promise = (async () => {
      try {
        const response = await fetch(url, fetchOptions);
        clearTimeout(timeout);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData && (errorData.error || JSON.stringify(errorData)) || `API request failed: ${response.status} ${response.statusText}`);
        }

        return response.json();
      } catch (error: any) {
        clearTimeout(timeout);
        if (error && error.name === 'AbortError') {
          throw new Error(`Network error: request to ${endpoint} timed out after ${timeoutMs}ms`);
        }
        if (error instanceof TypeError && error.message && error.message.includes('fetch')) {
          throw new Error(`Network error: Cannot connect to backend at ${this.baseUrl}. Please check if the backend is running.`);
        }
        throw error;
      } finally {
        // Ensure we remove the in-flight record regardless of outcome
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, promise);
    return promise;
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

  // qBittorrent endpoints
  async getQBittorrentStatus(): Promise<ServiceHealth> {
    return this.request('/api/qbittorrent/status');
  }

  async getQBittorrentStats(): Promise<QBittorrentStats> {
    return this.request('/api/qbittorrent/stats');
  }

  // Tor endpoints
  async getTorRelay(nickname?: string): Promise<TorRelay> {
    const endpoint = nickname ? `/api/tor/relay/${nickname}` : '/api/tor/relay';
    return this.request(endpoint);
  }

  async getTorHealth(): Promise<ServiceHealth> {
    return this.request('/api/tor/health');
  }

  // Synology endpoints
  async getSynologyStatus(): Promise<ServiceHealth> {
    return this.request('/api/synology/status');
  }

  async getSynologyStats(): Promise<any> {
    return this.request('/api/synology/stats');
  }

  // Roon endpoints
  async getRoonStatus(): Promise<RoonStatus> {
    return this.request('/api/roon/status');
  }

  async getRoonStats(): Promise<RoonStatus> {
    return this.request('/api/roon/stats');
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