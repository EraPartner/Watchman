export type ServerStatus = 'online' | 'offline' | 'warning' | 'maintenance';

export type ServerType = 
  | 'bitcoin' 
  | 'network' 
  | 'torrent' 
  | 'storage' 
  | 'iot' 
  | 'proxy' 
  | 'wallet';

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