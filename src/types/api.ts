// API Response Types
export interface ServiceHealth {
  status: 'online' | 'offline' | 'warning' | 'loading';
  error?: string;
}

export interface BitcoinStats {
  version: string;
  protocolVersion: number;
  blocks: number;
  headers: number;
  connections: number;
  inbound: number;
  outbound: number;
  difficulty: number;
  verificationProgress: number;
  initialBlockDownload: boolean;
  chain: string;
  networkHashPs: number;
  mempool: {
    size: number;
    bytes: number;
    usage: number;
    maxmempool: number;
    mempoolminfee: number;
  };
  uptime: number;
}

export interface AdGuardStats {
  protectionEnabled: boolean;
  version: string;
  dnsQueries: number;
  blockedFiltering: number;
  blockedSafebrowsing: number;
  blockedParental: number;
  upstreamServers: string[];
  filteringEnabled: boolean;
  safebrowsingEnabled: boolean;
  parentalEnabled: boolean;
  blockingPercentage: string;
}

export interface TorRelayStats {
  nickname?: string;
  fingerprint: string;
  flags: string[];
  bandwidth: number;
  country: string;
  as: string;
  orPort?: string;
  running: boolean;
}

// API Error Response
export interface ApiError {
  error: string;
}