import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { ExternalLink } from 'lucide-react';
import { 
  Cpu, 
  Thermometer, 
  Server,
  Network,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Wifi
} from 'lucide-react';

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

const SynologyCard: React.FC = () => {
  const [stats, setStats] = useState<SynologyStats | null>(null);
  const [status, setStatus] = useState<SynologyStatus | null>(null);
  const [frontendConfig, setFrontendConfig] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Fetch frontend config for Synology host/webPort (runs once)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/config/frontend');
        if (!res.ok) return;
        const cfg = await res.json();
        if (mounted) setFrontendConfig(cfg.services?.synology || null);
      } catch (err) {
        console.warn('Failed to fetch frontend config:', err);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const fetchData = async () => {
    try {
      const [statsResponse, statusResponse] = await Promise.all([
        fetch('/api/synology/stats').catch(() => null),
        fetch('/api/synology/status').catch(() => null)
      ]);

      // Handle stats response
      if (statsResponse?.ok) {
        const statsText = await statsResponse.text();
        
        if (statsText.trim()) {
          try {
            const statsData = JSON.parse(statsText);
            setStats(statsData);
          } catch (parseError) {
            console.error('Failed to parse stats JSON:', parseError);
          }
        }
      } else if (statsResponse) {
        console.error('Stats response not OK:', statsResponse.status, statsResponse.statusText);
      }

      // Handle status response
      if (statusResponse?.ok) {
        const statusText = await statusResponse.text();
        
        if (statusText.trim()) {
          try {
            const statusData = JSON.parse(statusText);
            setStatus(statusData);
          } catch (parseError) {
            console.error('Failed to parse status JSON:', parseError);
          }
        }
      } else if (statusResponse) {
        console.error('Status response not OK:', statusResponse.status, statusResponse.statusText);
      }

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch Synology data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const isOnline = stats?.status === 'online' || status?.status === 'online';
  const hasError = stats?.status === 'error' || status?.status === 'error';

  const getStatusBadge = () => {
    if (loading) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Loading
        </Badge>
      );
    }

    if (isOnline) {
      return (
        <Badge variant="default" className="flex items-center gap-1 bg-green-500">
          <CheckCircle className="h-3 w-3" />
          Online
        </Badge>
      );
    }

    if (hasError) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Error
        </Badge>
      );
    }

    return (
      <Badge variant="secondary" className="flex items-center gap-1">
        <Wifi className="h-3 w-3" />
        Offline
      </Badge>
    );
  };

  // Compute clickable host href using frontendConfig or fallbacks
  const synHost = frontendConfig?.host || null;
  const synPort = frontendConfig?.webPort ? String(frontendConfig.webPort) : null;
  let synologyHref: string | null = null;
  // Compute a host-only display value (strip scheme/path) and include port for display
  const synHostOnly = synHost ? synHost.replace(/^https?:\/\//i, '').replace(/\/.*/, '').trim() : null;
  const synDisplay = synHostOnly ? (synPort ? `${synHostOnly}:${synPort}` : synHostOnly) : null;
  if (synHost) {
    try {
      // Normalize host: strip any existing scheme and any trailing path
      const hostOnly = synHost.replace(/^https?:\/\//i, '').replace(/\/.*/, '').trim();
      // Force HTTPS and include the configured web port if provided
      synologyHref = `https://${hostOnly}${synPort ? `:${synPort}` : ''}`;
    } catch (err) {
      // Fallback: best-effort concatenation with https
      const candidate = synHost.replace(/^https?:\/\//i, '').replace(/\/.*/, '') + (synPort ? `:${synPort}` : '');
      synologyHref = `https://${candidate}`;
    }
  }

  if (loading && !stats && !status) {
    return (
      <Card className="w-full self-start h-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Server className="h-4 w-4" />
            Synology NAS
          </CardTitle>
          {getStatusBadge()}
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full self-start h-auto">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Server className="h-4 w-4" />
          Synology NAS
        </CardTitle>
        {getStatusBadge()}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* System Information - Updated to use direct system object */}
        {(stats?.system || status?.data) && (
          <div className="grid grid-cols-1 gap-4 text-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Server className="h-3 w-3" />
                Model
              </div>
              <div className="font-medium">
                {stats?.system?.model || status?.data?.model || 'Unknown'}
              </div>
            </div>
            {/* Host / Web UI link */}
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
                    title={`Open ${synDisplay || frontendConfig?.host} in new tab`}
                  >
                    <span className="truncate">{synDisplay || frontendConfig?.host}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  (synDisplay || frontendConfig?.host || 'Unknown')
                )}
               </div>
             </div>
          </div>
        )}

        {/* Performance Metrics - Updated to use direct objects */}
        {isOnline && stats && (
          <div className="space-y-4">
            {/* CPU Usage */}
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
                
                {/* CPU Temperature */}
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

            {/* Network Stats */}
            {stats.network && (
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-muted-foreground text-sm">
                  <Network className="h-3 w-3" />
                  Network Activity
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted rounded-md p-2">
                    <div className="text-xs text-muted-foreground">Download</div>
                    <div className="text-sm font-medium">
                      {formatBytes(stats.network.bytesReceived || 0)}
                    </div>
                  </div>
                  <div className="bg-muted rounded-md p-2">
                    <div className="text-xs text-muted-foreground">Upload</div>
                    <div className="text-sm font-medium">
                      {formatBytes(stats.network.bytesTransmitted || 0)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Show partial errors if some data failed */}
        {stats?.errors && stats.errors.length > 0 && isOnline && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2">
            <div className="text-xs text-yellow-800 font-medium mb-1">
              ⚠️ Some data unavailable:
            </div>
            <div className="text-xs text-yellow-700">
              {stats.errors.map(e => e.component).join(', ')} failed to load
            </div>
          </div>
        )}

        {/* Error States */}
        {!isOnline && !loading && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
            <div className="text-sm text-muted-foreground mb-2">
              {hasError ? 'Connection Error' : 'Synology NAS is offline'}
            </div>
            {(stats?.error || status?.error) && (
              <div className="text-xs text-red-500 max-w-full break-words">
                {stats?.error || status?.error}
              </div>
            )}
            <button 
              onClick={fetchData}
              className="mt-3 text-xs text-blue-500 hover:text-blue-700 underline"
              disabled={loading}
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="text-xs text-muted-foreground text-center pt-3 border-t">
          Last updated: {lastUpdate.toLocaleTimeString()}
        </div>
      </CardContent>
    </Card>
  );
};

export default SynologyCard;