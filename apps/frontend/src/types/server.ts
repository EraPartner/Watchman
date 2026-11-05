export type ServerStatus = "online" | "offline" | "warning" | "maintenance";

export type ServerType =
  | "bitcoin"
  | "network"
  | "torrent"
  | "storage"
  | "iot"
  | "proxy"
  | "wallet"
  | "tor";

export interface ServerStats {
  uptime?: string;
  cpu?: number;
  memory?: number;
  disk?: number;
  network?: {
    incoming: string;
    outgoing: string;
  };
  customStats?: Record<string, string | number>;
}

export interface Server {
  id: string;
  name: string;
  type: ServerType;
  ip: string;
  port?: number;
  status: ServerStatus;
  // lastSeen can be absent depending on the service response; make optional
  lastSeen?: Date;
  stats?: ServerStats;
  description?: string;
}

export interface AdGuardServerStats extends ServerStats {
  totalQueries: number;
  blockedQueries: number;
  allowedQueries: number;
  blockingRate: number;
  protectionEnabled: boolean;
  version: string;
  topBlockedDomain: string;
  topQueriedDomain: string;
  avgProcessingTime: number;
  running: boolean;
  timeUnits?: string | undefined;
  topClient?: string | undefined;
  safebrowsingBlocked?: number | undefined;
  safesearchBlocked?: number | undefined;
  parentalBlocked?: number | undefined;
}

export interface TorServerStats extends ServerStats {
  version?: string | undefined;
  nickname?: string | undefined;
  fingerprint: string;
  relayType: "relay" | "exit" | "bridge" | "client";
  bandwidth: {
    current: number; // KB/s
    average: number; // KB/s
    burst: number; // KB/s
    observed?: number | undefined; // KB/s - Optional to match API response
  };
  connections: {
    current: number;
    total: number;
  };
  circuits: {
    active: number;
    total: number;
  };
  flags: string[]; // Like ['Fast', 'Guard', 'HSDir', 'Running', 'Stable', 'V2Dir', 'Valid']
  consensusWeight?: number | undefined;
  exitPolicy?: string | undefined;
  hibernating?: boolean | undefined;
  orPort?: number | undefined;
  controlPort?: number | undefined;
  running: boolean;
  country?: string | undefined;
  city?: string | undefined;
  platform?: string | undefined;
  contact?: string | undefined;
}

export interface ServerWithService extends Server {
  serviceType?: "adguard" | "synology" | "qbittorrent" | "bitcoin" | "tor";
  serviceStats?: AdGuardServerStats | TorServerStats | ServerStats;
}
