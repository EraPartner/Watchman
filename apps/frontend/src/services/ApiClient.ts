import { APP_CONFIG } from "../lib/constants";
import { csrfManager } from "../lib/csrf";
import { getBackendUrl } from "../lib/backendUrl";
import { extractApiError, unwrapApiResponse } from "../lib/apiResponse";

// Re-export for backward compatibility
const backendUrl = getBackendUrl();

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

type GenericServiceStats = Record<string, unknown>;

interface ServiceInstanceEntry {
  id: string;
  type: string;
}

export interface ServiceInstancesResponse {
  instances: Record<
    string,
    {
      count: number;
      instances: ServiceInstanceEntry[];
    }
  >;
  timestamp: string;
}

interface HomebridgeBaseResponse {
  error?: string;
  warning?: string;
  message?: string;
  timestamp?: string;
}

interface HomebridgeVersionResponse extends HomebridgeBaseResponse {
  installedVersion?: string;
  installed_version?: string;
  installed?: string;
  version?: string;
  homebridgeVersion?: string;
  homebridge_version?: string;
  raw?: {
    installedVersion?: string;
    installed_version?: string;
    installed?: string;
    version?: string;
    homebridgeVersion?: string;
    homebridge_version?: string;
  };
}

interface HomebridgeServerInformationResponse extends HomebridgeBaseResponse {
  data?: {
    installedVersion?: string;
    installed_version?: string;
    installed?: string;
    version?: string;
    homebridgeVersion?: string;
    homebridge_version?: string;
    serverVersion?: string;
    uptime?: number | string;
    time?: { uptime?: number | string };
    raw?: {
      installedVersion?: string;
      installed_version?: string;
      installed?: string;
      version?: string;
      homebridgeVersion?: string;
      homebridge_version?: string;
      serverVersion?: string;
      time?: { uptime?: number | string };
    };
  };
  raw?: Record<string, unknown>;
}

interface HomebridgeAccessory {
  instance?: {
    connectionFailedCount?: number;
  };
  [key: string]: unknown;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    nextCursor?: string | null;
  };
}

export type UpdateService =
  | "adguard"
  | "bitcoin"
  | "tor"
  | "ipfs"
  | "homebridge";

export interface UpdateInfo {
  currentVersion: string;
  updateAvailable: boolean;
  latestVersion: string;
  releaseUrl?: string;
  recommendedUrl?: string;
}

export type HomebridgeAccessoriesResponse =
  | HomebridgeBaseResponse
  | (HomebridgeBaseResponse & {
      data?: HomebridgeAccessory[];
      lastData?: {
        data?: HomebridgeAccessory[];
      };
    })
  | (HomebridgeBaseResponse & PaginatedResponse<HomebridgeAccessory>);

export interface LoginResponse {
  message?: string;
  token?: string;
  user?: {
    username?: string;
    id?: string | number;
  };
  [key: string]: unknown;
}

export interface LogoutResponse {
  success: boolean;
  [key: string]: unknown;
}

export interface AuthMeResponse {
  authenticated: boolean;
  user?: {
    username?: string;
  };
  [key: string]: unknown;
}

type ApiRequestOptions = {
  method?: string;
  headers?: unknown;
  body?: unknown;
  credentials?: "include" | "omit" | "same-origin";
  signal?: unknown;
};

export interface ServicesHealthResponse {
  timestamp: string;
  services: Record<string, ServiceHealth & Record<string, unknown>>;
}

export interface FrontendConfig {
  enabledServices: string[];
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
  private inFlightRequests: Map<string, Promise<unknown>> = new Map();

  constructor() {
    // Use smart URL detection
    this.baseUrl = backendUrl;

    // Restore persisted fallback auth token (if any) so Authorization header
    // continues to be sent across page reloads in dev scenarios where cookies
    // may not be available. Use a safe check for browser environment.
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const saved = window.localStorage.getItem("watchman_auth_token");
        if (saved) this.authToken = saved;
      }
    } catch {
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

  async getIpfsStats(): Promise<GenericServiceStats> {
    return this.request("/api/ipfs/stats");
  }

  // Bitcoin endpoints
  async getBitcoinStatus(): Promise<ServiceHealth> {
    return this.request(
      "/api/bitcoin/status",
      undefined,
      APP_CONFIG.BITCOIN_API_TIMEOUT
    );
  }

  async getBitcoinStats(): Promise<BitcoinStats> {
    return this.request(
      "/api/bitcoin/stats",
      undefined,
      APP_CONFIG.BITCOIN_API_TIMEOUT
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

  async getSynologyStats(): Promise<GenericServiceStats> {
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
  async getPhilipsStatus(): Promise<GenericServiceStats> {
    return this.request("/api/philips/status");
  }

  async getPhilipsStats(): Promise<GenericServiceStats> {
    return this.request("/api/philips/stats");
  }

  // Homebridge endpoints
  /** @deprecated Use getHomebridgeServerInformation() */
  async getHomebridgeStatus(): Promise<HomebridgeServerInformationResponse> {
    return this.getHomebridgeServerInformation();
  }

  /** @deprecated Use getHomebridgeServerInformation() */
  async getHomebridgeStats(): Promise<HomebridgeServerInformationResponse> {
    return this.getHomebridgeServerInformation();
  }

  /** @deprecated Use getHomebridgeServerInformation() */
  async getStatusHomebridge(): Promise<HomebridgeServerInformationResponse> {
    return this.getHomebridgeServerInformation();
  }

  async getHomebridgeVersion(): Promise<HomebridgeVersionResponse> {
    return this.request("/api/status/homebridge-version");
  }

  async getHomebridgeServerInformation(): Promise<HomebridgeServerInformationResponse> {
    return this.request("/api/status/server-information");
  }

  async getHomebridgeAccessories(): Promise<HomebridgeAccessoriesResponse> {
    return this.request("/api/accessories");
  }

  async getServiceUpdates(serviceKey: UpdateService): Promise<UpdateInfo> {
    return this.request(`/api/${serviceKey}/updates`);
  }

  // Alby Hub endpoints
  async getAlbyStatus(): Promise<ServiceHealth> {
    return this.request("/api/albyhub/status");
  }

  async getAlbyStats(): Promise<GenericServiceStats> {
    return this.request("/api/albyhub/stats");
  }

  // Health check
  async getServicesHealth(): Promise<ServicesHealthResponse> {
    return this.request("/api/services/health");
  }

  async setAdGuardProtection(
    enabled: boolean,
    duration?: number
  ): Promise<{ success: boolean; [key: string]: unknown }> {
    return this.request("/api/adguard/protection", {
      method: "POST",
      body: JSON.stringify({ enabled, duration }),
      headers: { "Content-Type": "application/json" },
    });
  }

  async clearBackendCache(
    type = "all"
  ): Promise<{ success: boolean; message?: string; [key: string]: unknown }> {
    return this.request("/api/cache/clear", {
      method: "POST",
      body: JSON.stringify({ type }),
      headers: { "Content-Type": "application/json" },
    });
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

  // Service instances
  async getServiceInstances(): Promise<ServiceInstancesResponse> {
    return this.request("/api/services/instances");
  }

  // Generic service health and stats (for multi-instance support)
  async getServiceHealth(serviceKey: string): Promise<ServiceHealth> {
    return this.request(`/api/${serviceKey}/status`);
  }

  async getServiceStats(serviceKey: string): Promise<GenericServiceStats> {
    return this.request(`/api/${serviceKey}/stats`);
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
      String(serviceName)
    )}`;
    return this.request(endpoint);
  }

  // Authentication helpers
  async login(
    username: string,
    password: string,
    remember = false
  ): Promise<LoginResponse> {
    const res = await this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password, remember }),
      headers: { "Content-Type": "application/json" },
    });

    // If server returned a token in the response body, store it as a fallback
    // auth token so future requests include an Authorization header when cookies
    // are not available (dev/proxy scenarios).
    try {
      const token =
        res && typeof res === "object" && "token" in res
          ? res.token
          : undefined;
      if (typeof token === "string" && token.length > 0) {
        this.authToken = token;
        try {
          if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.setItem("watchman_auth_token", token);
          }
        } catch {
          // ignore storage errors
        }
      }
    } catch {
      // ignore
    }

    return res;
  }

  async logout(): Promise<LogoutResponse> {
    // Clear in-memory token as well as calling logout endpoint to clear cookie
    this.authToken = null;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem("watchman_auth_token");
      }
    } catch {
      // ignore storage errors
    }
    return this.request("/api/auth/logout", { method: "POST" });
  }

  async getAuthMe(): Promise<AuthMeResponse> {
    return this.request("/api/auth/me");
  }

  private makeRequestKey(url: string, options?: ApiRequestOptions) {
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
    } catch {
      bodyKey = String(options?.body);
    }
    return `${method} ${url} ${bodyKey}`;
  }

  private normalizeHeaders(headers?: unknown): Record<string, string> {
    const normalized: Record<string, string> = {};

    if (!headers) {
      return normalized;
    }

    if (headers instanceof Headers) {
      headers.forEach((value, key) => {
        normalized[key] = value;
      });
      return normalized;
    }

    if (Array.isArray(headers)) {
      for (const entry of headers) {
        if (!Array.isArray(entry) || entry.length < 2) continue;
        const [key, value] = entry;
        normalized[String(key)] = String(value);
      }
      return normalized;
    }

    if (typeof headers === "object" && headers !== null) {
      for (const [key, value] of Object.entries(
        headers as Record<string, unknown>
      )) {
        if (value !== undefined) {
          normalized[key] = String(value);
        }
      }
    }

    return normalized;
  }

  private hasHeader(
    headers: Record<string, string>,
    headerName: string
  ): boolean {
    const target = headerName.toLowerCase();
    return Object.keys(headers).some((key) => key.toLowerCase() === target);
  }

  private async request<T>(
    endpoint: string,
    options?: ApiRequestOptions,
    customTimeout?: number
  ): Promise<T> {
    // Retry configuration
    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 500;
    const RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504]; // Timeout, TooManyRequests, Server errors

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.fetchWithDedup<T>(endpoint, options, customTimeout);
      } catch (error) {
        lastError = error;

        const status =
          typeof error === "object" && error !== null && "status" in error
            ? Number((error as { status?: unknown }).status)
            : undefined;

        const name =
          typeof error === "object" && error !== null && "name" in error
            ? String((error as { name?: unknown }).name)
            : undefined;

        // Check if error is retryable
        const isRetryable =
          (status !== undefined && RETRYABLE_STATUSES.includes(status)) ||
          name === "AbortError" ||
          (error instanceof TypeError && error.message?.includes("fetch"));

        // Don't retry on non-retryable errors or if we've exhausted retries
        if (!isRetryable || attempt === MAX_RETRIES) {
          throw error;
        }

        // Calculate exponential backoff delay with jitter
        const delayMs =
          BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError || new Error("Unknown error after retries");
  }

  private async fetchWithDedup<T>(
    endpoint: string,
    options?: ApiRequestOptions,
    customTimeout?: number
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

    const method = (options?.method || "GET").toUpperCase();
    const headers = this.normalizeHeaders(options?.headers);

    if (
      method !== "GET" &&
      method !== "HEAD" &&
      !this.hasHeader(headers, "content-type")
    ) {
      headers["Content-Type"] = "application/json";
    }

    // Add CSRF token for state-changing methods (POST, PUT, PATCH, DELETE)
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      csrfManager.addTokenToHeaders(headers);
    }

    // If we have an in-memory auth token (returned by login), attach it as a Bearer
    // Authorization header. This is a fallback for dev environments where cookies
    // may not be persisted/sent. If the caller provided an Authorization header,
    // do not overwrite it.
    if (this.authToken && !this.hasHeader(headers, "authorization")) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }

    const fetchOptions = Object.assign({}, options, {
      headers,
      credentials: "include",
      signal: controller.signal,
    });

    const promise = (async () => {
      try {
        const response = await fetch(url, fetchOptions);
        clearTimeout(timeout);

        const responseBody = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));

        if (!response.ok) {
          const error = new Error(
            extractApiError(
              responseBody,
              `API request failed: ${response.status} ${response.statusText}`
            )
          );
          (error as Error & { status?: number }).status = response.status;
          throw error;
        }

        return unwrapApiResponse<T>(responseBody);
      } catch (error) {
        clearTimeout(timeout);
        if (error instanceof Error && error.name === "AbortError") {
          const timeoutError = new Error(
            `Network error: request to ${endpoint} timed out after ${timeoutMs}ms`
          );
          (timeoutError as Error & { name: string }).name = "AbortError";
          throw timeoutError;
        }
        if (
          error instanceof TypeError &&
          error.message &&
          error.message.includes("fetch")
        ) {
          throw new Error(
            `Network error: Cannot connect to backend at ${this.baseUrl}. Please check if the backend is running.`
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
