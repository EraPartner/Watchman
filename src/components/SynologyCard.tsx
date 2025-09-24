import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { ExternalLink } from 'lucide-react';
import {
  Cpu,
  Thermometer,
  Server,
  Network,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { ServerStatusBadge } from './ServerStatusBadge';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/ApiClient';
import { useFrontendConfig } from '../hooks/useServicesHealth';

// Updated interfaces to match your backend's actual data structure
interface SynologyStats {
  status: 'online' | 'offline' | 'error';
  timestamp: string;
  system?: {
    name: string;
    uptime: number;
    model: string;
    version: string;
    status: string;
  };
  cpu?: {
    usage: number;
    temperature: number;
  };
  network?: {
    bytesReceived: number;
    bytesTransmitted: number;
  };
  lastUpdated?: string;
  errors?: Array<{ component: string; error: string }>;
  error?: string;
}

interface SynologyStatus {
  status: 'online' | 'offline' | 'error';
  timestamp: string;
  data?: {
    name?: string;
    model?: string;
    version?: string;
    uptime?: string;
    systemStatus?: string;
  };
  error?: string;
}

const formatBytes = (bytes: number): string => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

const SynologyCard: React.FC = () => {
  const statusQuery = useQuery({
    queryKey: ['synology', 'status'],
    queryFn: () => apiClient.getSynologyStatus(),
    refetchInterval: 30000,
    retry: 1,
  });

  const statsQuery = useQuery({
    queryKey: ['synology', 'stats'],
    queryFn: () => apiClient.getSynologyStats(),
    refetchInterval: 30000,
    retry: 1,
  });

  const frontendConfigQuery = useFrontendConfig();

  const status = statusQuery.data as SynologyStatus | undefined;
  const stats = statsQuery.data as SynologyStats | undefined;
  const cfg = frontendConfigQuery.data?.services?.synology ?? null;
  const loading = statusQuery.isLoading && statsQuery.isLoading;
  const isOnline = status?.status === 'online' || stats?.status === 'online';
  const hasError = status?.status === 'error' || stats?.status === 'error';
  const lastUpdate = new Date(status?.timestamp || stats?.timestamp || Date.now());

  // Compute host + href from frontend config (if available)
  const synHost = cfg?.host || null;
  const synPort = cfg?.webPort ? String(cfg.webPort) : null;
  const synHostOnly = synHost ? synHost.replace(/^https?:\/\//i, '').replace(/\/.*/, '').trim() : null;
  const synDisplay = synHostOnly ? (synPort ? `${synHostOnly}:${synPort}` : synHostOnly) : null;
  let synologyHref: string | null = null;
  if (synHost) {
    try {
      const hostOnly = synHost.replace(/^https?:\/\//i, '').replace(/\/.*/, '').trim();
      synologyHref = `https://${hostOnly}${synPort ? `:${synPort}` : ''}`;
    } catch (err) {
      const candidate = synHost.replace(/^https?:\/\//i, '').replace(/\/.*/, '') + (synPort ? `:${synPort}` : '');
      synologyHref = `https://${candidate}`;
    }
  }

  return (
    <Card className="w-full self-start h-auto">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Server className="h-4 w-4" />
          Synology NAS
        </CardTitle>
        <ServerStatusBadge status={loading ? 'loading' : isOnline ? 'online' : hasError ? 'error' : 'offline'} />
      </CardHeader>

      <CardContent className="space-y-4">
        {(stats?.system || status?.data) ? (
          <div className="grid grid-cols-1 gap-4 text-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Server className="h-3 w-3" />
                Model
              </div>
              <div className="font-medium">{stats?.system?.model || status?.data?.model || 'Unknown'}</div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Server className="h-3 w-3" />
                Host
              </div>
              <div className="font-medium">
                {synologyHref ? (
                  <a
                    href={synologyHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors flex items-center gap-1 mt-1 w-fit"
                    title={`Open ${synDisplay || cfg?.host} in new tab`}
                  >
                    <span className="truncate">{synDisplay || cfg?.host}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  synDisplay || cfg?.host || 'Unknown'
                )}
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {isOnline && stats && (
          <div className="space-y-4">
            {stats.cpu && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Cpu className="h-3 w-3" />
                    CPU Usage
                  </div>
                  <span className="font-medium">{stats.cpu.usage}%</span>
                </div>
                <Progress value={stats.cpu.usage} className="h-2" />

                {stats.cpu.temperature && stats.cpu.temperature > 0 && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Thermometer className="h-3 w-3" />
                      Temperature
                    </div>
                    <span>{stats.cpu.temperature}°C</span>
                  </div>
                )}
              </div>
            )}

            {stats.network && (
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-muted-foreground text-sm">
                  <Network className="h-3 w-3" />
                  Network Activity
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted rounded-md p-2">
                    <div className="text-xs text-muted-foreground">Download</div>
                    <div className="text-sm font-medium">{formatBytes(stats.network.bytesReceived || 0)}</div>
                  </div>
                  <div className="bg-muted rounded-md p-2">
                    <div className="text-xs text-muted-foreground">Upload</div>
                    <div className="text-sm font-medium">{formatBytes(stats.network.bytesTransmitted || 0)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {stats?.errors && stats.errors.length > 0 && isOnline && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2">
            <div className="text-xs text-yellow-800 font-medium mb-1">⚠️ Some data unavailable:</div>
            <div className="text-xs text-yellow-700">{stats.errors.map(e => e.component).join(', ')} failed to load</div>
          </div>
        )}

        {!isOnline && !loading && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
            <div className="text-sm text-muted-foreground mb-2">{hasError ? 'Connection Error' : 'Synology NAS is offline'}</div>
            {(stats?.error || status?.error) && (
              <div className="text-xs text-red-500 max-w-full break-words">{stats?.error || status?.error}</div>
            )}
            <div className="mt-3 text-xs">
              <button onClick={() => { statusQuery.refetch(); statsQuery.refetch(); frontendConfigQuery.refetch(); }} className="text-blue-500 hover:text-blue-700 underline" disabled={loading}>
                Retry Connection
              </button>
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground text-center pt-3 border-t">Last updated: {lastUpdate.toLocaleTimeString()}</div>
      </CardContent>
    </Card>
  );
};

export default SynologyCard;