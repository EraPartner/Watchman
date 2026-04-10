import { APP_CONFIG } from "../../lib/constants";
import { csrfManager } from "../../lib/csrf";
import { ApiClientCore } from "./core";
import type {
  AdGuardStats,
  AuthMeResponse,
  BitcoinStats,
  FrontendConfig,
  GenericServiceStats,
  HomebridgeAccessoriesResponse,
  HomebridgeServerInformationResponse,
  HomebridgeVersionResponse,
  LoginResponse,
  LogoutResponse,
  QBittorrentStats,
  RoonStatus,
  RouterArpResponse,
  ServiceHealth,
  ServiceInstancesResponse,
  ServicesHealthResponse,
  TorRelay,
  UpdateInfo,
  UpdateService,
} from "./types";

export class ApiClientEndpoints {
  private core: ApiClientCore;

  constructor(core: ApiClientCore) {
    this.core = core;
  }

  async getAdGuardStatus(): Promise<ServiceHealth> {
    return this.core.request("/api/adguard/status");
  }

  async getAdGuardStats(): Promise<AdGuardStats> {
    return this.core.request("/api/adguard/stats");
  }

  async getIpfsStatus(): Promise<ServiceHealth> {
    return this.core.request("/api/ipfs/status");
  }

  async getIpfsStats(): Promise<GenericServiceStats> {
    return this.core.request("/api/ipfs/stats");
  }

  async getBitcoinStatus(): Promise<ServiceHealth> {
    return this.core.request(
      "/api/bitcoin/status",
      undefined,
      APP_CONFIG.BITCOIN_API_TIMEOUT
    );
  }

  async getBitcoinStats(): Promise<BitcoinStats> {
    return this.core.request(
      "/api/bitcoin/stats",
      undefined,
      APP_CONFIG.BITCOIN_API_TIMEOUT
    );
  }

  async getQBittorrentStatus(): Promise<ServiceHealth> {
    return this.core.request("/api/qbittorrent/status");
  }

  async getQBittorrentStats(): Promise<QBittorrentStats> {
    return this.core.request("/api/qbittorrent/stats");
  }

  async getTorRelay(nickname?: string): Promise<TorRelay> {
    const endpoint = nickname ? `/api/tor/relay/${nickname}` : "/api/tor/relay";
    return this.core.request(endpoint);
  }

  async getTorHealth(): Promise<ServiceHealth> {
    return this.core.request("/api/tor/health");
  }

  async getSynologyStatus(): Promise<ServiceHealth> {
    return this.core.request("/api/synology/status");
  }

  async getSynologyStats(): Promise<GenericServiceStats> {
    return this.core.request("/api/synology/stats");
  }

  async getRoonStatus(): Promise<RoonStatus> {
    return this.core.request("/api/roon/status");
  }

  async getRoonStats(): Promise<RoonStatus> {
    return this.core.request("/api/roon/stats");
  }

  async getPhilipsStatus(): Promise<GenericServiceStats> {
    return this.core.request("/api/philips/status");
  }

  async getPhilipsStats(): Promise<GenericServiceStats> {
    return this.core.request("/api/philips/stats");
  }

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
    return this.core.request("/api/status/homebridge-version");
  }

  async getHomebridgeServerInformation(): Promise<HomebridgeServerInformationResponse> {
    return this.core.request("/api/status/server-information");
  }

  async getHomebridgeAccessories(): Promise<HomebridgeAccessoriesResponse> {
    return this.core.request("/api/accessories");
  }

  async getServiceUpdates(serviceKey: UpdateService): Promise<UpdateInfo> {
    return this.core.request(`/api/${serviceKey}/updates`);
  }

  async getAlbyStatus(): Promise<ServiceHealth> {
    return this.core.request("/api/albyhub/status");
  }

  async getAlbyStats(): Promise<GenericServiceStats> {
    return this.core.request("/api/albyhub/stats");
  }

  async getServicesHealth(): Promise<ServicesHealthResponse> {
    return this.core.request("/api/services/health");
  }

  async setAdGuardProtection(
    enabled: boolean,
    duration?: number
  ): Promise<{ success: boolean; [key: string]: unknown }> {
    return this.core.request("/api/adguard/protection", {
      method: "POST",
      body: JSON.stringify({ enabled, duration }),
      headers: { "Content-Type": "application/json" },
    });
  }

  async clearBackendCache(
    type = "all"
  ): Promise<{ success: boolean; message?: string; [key: string]: unknown }> {
    return this.core.request("/api/cache/clear", {
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
    return this.core.request("/health");
  }

  async getFrontendConfig(): Promise<FrontendConfig> {
    const config = await this.core.request<FrontendConfig>(
      "/api/config/frontend"
    );
    csrfManager.configure({
      cookieName: config.security?.csrf?.cookieName,
      headerName: config.security?.csrf?.headerName,
    });
    return config;
  }

  async getServiceInstances(): Promise<ServiceInstancesResponse> {
    return this.core.request("/api/services/instances");
  }

  async getServiceHealth(serviceKey: string): Promise<ServiceHealth> {
    return this.core.request(`/api/${serviceKey}/status`);
  }

  async getServiceStats(serviceKey: string): Promise<GenericServiceStats> {
    return this.core.request(`/api/${serviceKey}/stats`);
  }

  async getRouterArp(serviceName: string): Promise<RouterArpResponse> {
    const endpoint = `/api/router/arp?service=${encodeURIComponent(
      String(serviceName)
    )}`;
    return this.core.request(endpoint);
  }

  async login(
    username: string,
    password: string,
    remember = false
  ): Promise<LoginResponse> {
    const res = await this.core.request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password, remember }),
      headers: { "Content-Type": "application/json" },
    });

    const compatibilityToken = this.core.extractCompatibilityAuthToken(res);
    this.core.setFallbackAuthToken(compatibilityToken || null);

    return res;
  }

  async logout(): Promise<LogoutResponse> {
    this.core.setFallbackAuthToken(null);
    return this.core.request("/api/auth/logout", { method: "POST" });
  }

  async getAuthMe(): Promise<AuthMeResponse> {
    return this.core.request("/api/auth/me");
  }
}
