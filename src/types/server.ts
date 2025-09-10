export type ServerStatus = 'online' | 'offline' | 'warning' | 'maintenance';

export type ServerType = 
  | 'bitcoin' 
  | 'network' 
  | 'torrent' 
  | 'storage' 
  | 'iot' 
  | 'proxy' 
  | 'wallet'
  | 'tor';

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
  lastSeen: Date;
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
}

export interface TorServerStats extends ServerStats {
  version?: string;
  nickname?: string;
  fingerprint: string;
  relayType: 'relay' | 'exit' | 'bridge' | 'client';
  bandwidth: {
    current: number;    // KB/s
    average: number;    // KB/s
    burst: number;      // KB/s
    observed?: number;  // KB/s - Optional to match API response
  };
  connections: {
    current: number;
    total: number;
  };
  circuits: {
    active: number;
    total: number;
  };
  flags: string[];      // Like ['Fast', 'Guard', 'HSDir', 'Running', 'Stable', 'V2Dir', 'Valid']
  consensusWeight?: number;
  exitPolicy?: string;
  hibernating?: boolean;
  orPort?: number;
  controlPort?: number;
  running: boolean;
  country?: string;
  city?: string;
  platform?: string;
  contact?: string;
}

export interface ServerWithService extends Server {
  serviceType?: 'adguard' | 'synology' | 'qbittorrent' | 'bitcoin' | 'tor';
  serviceStats?: AdGuardServerStats | TorServerStats | ServerStats;
}