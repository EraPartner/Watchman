import { env } from "../lib/env";
import { APP_CONFIG } from "../lib/constants";

// Smart backend URL detection
const getBackendUrl = (): string => {
  const envUrl = env.get("VITE_BACKEND_URL");

  // If explicitly set, use it
  if (envUrl) {
    return envUrl;
  }

  // In development mode, use relative URLs (Vite proxy will handle it)
  if (import.meta.env.DEV) {
    return "";
  }

  // In production, construct URL from current window location
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    // Use port 3001 for production backend
    return `${protocol}//${hostname}:3001`;
  }

  // Fallback
  return "http://localhost:3001";
};

// Simple API client that only talks to our backend
export interface ServiceHealth {
  status: "online" | "offline" | "warning" | "not_configured";
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
  status: "online" | "offline" | "error";
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
    ipfs?: {
      host?: string | null;
      port?: string | number | null;
      webUrl?: string | null;
      configured?: boolean;
    };
    albyhub?: {
      url?: string | null;
      configured?: boolean;
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
    nostrcheck?: {
      relayUrl?: string | null;
      webUrl?: string | null;
      enabled?: boolean;
      configured?: boolean;
    };
  };
  app: {
    name: string;
    version: string;
  };
}

class ApiClient {
  private baseUrl: string;
  private authToken: string | null = null;
  // Map to deduplicate concurrent identical requests
  private inFlightRequests: Map<string, Promise<any>> = new Map();

  constructor() {
    // Use smart URL detection
    this.baseUrl = getBackendUrl();

    // Restore persisted fallback auth token (if any) so Authorization header
    // continues to be sent across page reloads in dev scenarios where cookies
    // may not be available. Use a safe check for browser environment.
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const saved = window.localStorage.getItem("watchman_auth_token");
        if (saved) this.authToken = saved;
      }
    } catch (e) {
      // ignore storage errors
    }
  }

  // AdGuard endpoints
  async getAdGuardStatus(): Promise<ServiceHealth> {
    return this.request("/api/adguard/status");
  }

  async getAdGuardStats(): Promise<AdGuardStats> {
    return this.request("/api/adguard/stats");
  }

  // IPFS endpoints
  async getIpfsStatus(): Promise<ServiceHealth> {
    return this.request("/api/ipfs/status");
  }

  async getIpfsStats(): Promise<any> {
    return this.request("/api/ipfs/stats");
  }

  // Bitcoin endpoints
  async getBitcoinStatus(): Promise<ServiceHealth> {
    return this.request(
      "/api/bitcoin/status",
      undefined,
      APP_CONFIG.BITCOIN_API_TIMEOUT,
    );
  }

  async getBitcoinStats(): Promise<BitcoinStats> {
    return this.request(
      "/api/bitcoin/stats",
      undefined,
      APP_CONFIG.BITCOIN_API_TIMEOUT,
    );
  }

  // qBittorrent endpoints
  async getQBittorrentStatus(): Promise<ServiceHealth> {
    return this.request("/api/qbittorrent/status");
  }

  async getQBittorrentStats(): Promise<QBittorrentStats> {
    return this.request("/api/qbittorrent/stats");
  }

  // Tor endpoints
  async getTorRelay(nickname?: string): Promise<TorRelay> {
    const endpoint = nickname ? `/api/tor/relay/${nickname}` : "/api/tor/relay";
    return this.request(endpoint);
  }

  async getTorHealth(): Promise<ServiceHealth> {
    return this.request("/api/tor/health");
  }

  // Synology endpoints
  async getSynologyStatus(): Promise<ServiceHealth> {
    return this.request("/api/synology/status");
  }

  async getSynologyStats(): Promise<any> {
    return this.request("/api/synology/stats");
  }

  // Roon endpoints
  async getRoonStatus(): Promise<RoonStatus> {
    return this.request("/api/roon/status");
  }

  async getRoonStats(): Promise<RoonStatus> {
    return this.request("/api/roon/stats");
  }

  // Philips Bridge endpoints
  async getPhilipsStatus(): Promise<any> {
    return this.request("/api/philips/status");
  }

  async getPhilipsStats(): Promise<any> {
    return this.request("/api/philips/stats");
  }

  // Homebridge endpoints
  async getHomebridgeStatus(): Promise<any> {
    // Deprecated helper - route to allowed status endpoint
    return this.request("/api/status/server-information");
  }

  async getHomebridgeStats(): Promise<any> {
    // Deprecated helper - route to allowed server-information endpoint
    return this.request("/api/status/server-information");
  }

  // New /api/status/* endpoints
  async getStatusHomebridge(): Promise<any> {
    // Use the allowed server-information endpoint as the canonical status endpoint
    return this.request("/api/status/server-information");
  }

  async getHomebridgeVersion(): Promise<any> {
    return this.request("/api/status/homebridge-version");
  }

  async getHomebridgeServerInformation(): Promise<any> {
    return this.request("/api/status/server-information");
  }

  async getHomebridgeAccessories(): Promise<any> {
    return this.request("/api/accessories");
  }

  // Alby Hub endpoints
  async getAlbyStatus(): Promise<ServiceHealth> {
    return this.request("/api/albyhub/status");
  }

  async getAlbyStats(): Promise<any> {
    return this.request("/api/albyhub/stats");
  }

  // Health check
  async getServicesHealth(): Promise<ServicesHealthResponse> {
    return this.request("/api/services/health");
  }

  async getBackendHealth(): Promise<{
    status: string;
    timestamp: string;
    service: string;
    version: string;
  }> {
    return this.request("/health");
  }

  // Frontend configuration
  async getFrontendConfig(): Promise<FrontendConfig> {
    return this.request("/api/config/frontend");
  }

  // Router ARP lookup
  async getRouterArp(serviceName: string): Promise<{
    count: number;
    hosts: Array<{ ip: string; mac?: string; iface?: string }>;
    lan?: {
      count: number;
      hosts: Array<{ ip: string; mac?: string; iface?: string }>;
    };
    note?: string;
    raw?: string;
  }> {
    const endpoint = `/api/router/arp?service=${encodeURIComponent(
      String(serviceName),
    )}`;
    return this.request(endpoint);
  }

  // Authentication helpers
  async login(
    username: string,
    password: string,
    remember = false,
  ): Promise<any> {
    const res = await this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password, remember }),
      headers: { "Content-Type": "application/json" },
    });

    // If server returned a token in the response body, store it as a fallback
    // auth token so future requests include an Authorization header when cookies
    // are not available (dev/proxy scenarios).
    try {
      const r = res as any;
      const token =
        r && typeof r === "object" && "token" in r ? (r as any).token : null;
      if (token) {
        this.authToken = String(token);
        try {
          if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.setItem("watchman_auth_token", String(token));
          }
        } catch (e) {
          // ignore storage errors
        }
      }
    } catch (e) {
      // ignore
    }

    return res;
  }

  async logout(): Promise<any> {
    // Clear in-memory token as well as calling logout endpoint to clear cookie
    this.authToken = null;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem("watchman_auth_token");
      }
    } catch (e) {
      // ignore storage errors
    }
    return this.request("/api/auth/logout", { method: "POST" });
  }

  async getAuthMe(): Promise<any> {
    return this.request("/api/auth/me");
  }

  private makeRequestKey(url: string, options?: RequestInit) {
    const method =
      options && options.method ? String(options.method).toUpperCase() : "GET";
    let bodyKey = "";
    try {
      if (options && options.body != null) {
        bodyKey =
          typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body);
      }
    } catch (e) {
      bodyKey = String(options && (options as any).body);
    }
    return `${method} ${url} ${bodyKey}`;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit,
    customTimeout?: number,
  ): Promise<T> {
    // If baseUrl is empty, use relative endpoint so requests go to same-origin
    // and benefit from the dev proxy and browser cookies.
    const url = this.baseUrl ? `${this.baseUrl}${endpoint}` : endpoint;

    const key = this.makeRequestKey(url, options);
    if (this.inFlightRequests.has(key)) {
      // Reuse in-flight promise
      return this.inFlightRequests.get(key) as Promise<T>;
    }

    const controller = new AbortController();
    const timeoutMs = customTimeout || APP_CONFIG.API_TIMEOUT || 10000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    // Merge headers safely
    const headers = Object.assign(
      { "Content-Type": "application/json" },
      (options && options.headers) || {},
    );

    // If we have an in-memory auth token (returned by login), attach it as a Bearer
    // Authorization header. This is a fallback for dev environments where cookies
    // may not be persisted/sent. If the caller provided an Authorization header,
    // do not overwrite it.
    if (this.authToken && !(headers as any).Authorization) {
      (headers as any).Authorization = `Bearer ${this.authToken}`;
    }

    const fetchOptions: RequestInit = Object.assign({}, options, {
      headers,
      credentials: "include",
      signal: controller.signal,
    });

    const promise = (async () => {
      try {
        const response = await fetch(url, fetchOptions);
        clearTimeout(timeout);

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: "Unknown error" }));
          throw new Error(
            (errorData && (errorData.error || JSON.stringify(errorData))) ||
              `API request failed: ${response.status} ${response.statusText}`,
          );
        }

        return response.json();
      } catch (error: any) {
        clearTimeout(timeout);
        if (error && error.name === "AbortError") {
          throw new Error(
            `Network error: request to ${endpoint} timed out after ${timeoutMs}ms`,
          );
        }
        if (
          error instanceof TypeError &&
          error.message &&
          error.message.includes("fetch")
        ) {
          throw new Error(
            `Network error: Cannot connect to backend at ${this.baseUrl}. Please check if the backend is running.`,
          );
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
}

export const apiClient = new ApiClient();
