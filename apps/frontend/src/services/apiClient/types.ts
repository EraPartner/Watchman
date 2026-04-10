export interface ServiceHealth {
  status: "online" | "offline" | "warning" | "not_configured";
  responseTime?: number;
  error?: string;
  lastCheck?: string;
}

export interface AdGuardStats {
  version: string;
  running: boolean;
  protectionEnabled: boolean;
  dnsPort: number;
  httpPort: number;
  language: string;
  dhcpAvailable: boolean;
  totalQueries: number;
  blockedQueries: number;
  allowedQueries: number;
  blockingRate: number;
  avgProcessingTime: number;
  timeUnits: string;
  topBlockedDomain: string;
  topQueriedDomain: string;
  topClient: string;
  safebrowsingBlocked: number;
  safesearchBlocked: number;
  parentalBlocked: number;
}

export interface TorRelay {
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

export interface RoonPortCheck {
  port: number;
  open: boolean;
}

export interface RoonStatus {
  status: "online" | "offline" | "error";
  timestamp: string;
  data?: {
    host?: string;
    ping?: boolean | null;
    ports?: RoonPortCheck[];
  };
  error?: string;
}

export interface BitcoinStats {
  version?: string;
  blocks?: number;
  uptime?: number;
  blockchainSize?: number;
}

export interface QBittorrentStats {
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

export type GenericServiceStats = Record<string, unknown>;

export interface ServiceInstanceEntry {
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

export interface HomebridgeBaseResponse {
  error?: string;
  warning?: string;
  message?: string;
  timestamp?: string;
}

export interface HomebridgeVersionResponse extends HomebridgeBaseResponse {
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

export interface HomebridgeServerInformationResponse extends HomebridgeBaseResponse {
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

export interface HomebridgeAccessory {
  instance?: {
    connectionFailedCount?: number;
  };
  [key: string]: unknown;
}

export interface PaginatedResponse<T> {
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
    id?: string | number;
    username?: string;
  };
  [key: string]: unknown;
}

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
  security?: {
    csrf?: {
      cookieName?: string;
      headerName?: string;
    };
  };
  app: {
    name: string;
    version: string;
  };
}

export interface RouterArpResponse {
  count: number;
  hosts: Array<{ ip: string; mac?: string; iface?: string }>;
  lan?: {
    count: number;
    hosts: Array<{ ip: string; mac?: string; iface?: string }>;
  };
  note?: string;
  raw?: string;
}

export type ApiRequestOptions = {
  method?: string;
  headers?: unknown;
  body?: unknown;
  credentials?: "include" | "omit" | "same-origin";
  signal?: unknown;
};
