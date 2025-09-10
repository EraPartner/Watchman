// API Response Types
export interface ServiceHealth {
  status: 'online' | 'offline' | 'warning';
  responseTime?: number;
  lastCheck: string;
  error?: string;
}

export interface BitcoinStats {
  version: string;
  protocolVersion: number;
  blocks: number;
  headers: number;
  connections: number;
  difficulty: number;
  verificationProgress: number;
  initialBlockDownload: boolean;
  chain: string;
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
  message?: string;
  timestamp?: string;
}

// Union types for API responses
export type BitcoinApiResponse = BitcoinStats | ApiError;
export type AdGuardApiResponse = AdGuardStats | ApiError;
export type TorApiResponse = TorRelayStats | ApiError;