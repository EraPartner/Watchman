import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { 
  HardDrive, 
  Cpu, 
  Thermometer, 
  Clock, 
  Server,
  MemoryStick,
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
  memory?: {
    total: number;
    available: number;
    used: number;
    usage: number;
  };
  disk?: {
    total: number;
    used: number;
    free: number;
    usage: number;
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
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchData = async () => {
    try {
      const [statsResponse, statusResponse] = await Promise.all([
        fetch('/api/synology/stats').catch(() => null),
        fetch('/api/synology/status').catch(() => null)
      ]);

      // Handle stats response
      if (statsResponse?.ok) {
        const statsText = await statsResponse.text();
        console.log('Synology stats raw response:', statsText);
        
        if (statsText.trim()) {
          try {
            const statsData = JSON.parse(statsText);
            console.log('Synology stats parsed data:', statsData);
            setStats(statsData);
          } catch (parseError) {
            console.error('Failed to parse stats JSON:', parseError);
            console.error('Raw stats response that failed to parse:', statsText);
          }
        } else {
          console.error('Empty response from stats endpoint');
        }
      } else if (statsResponse) {
        console.error('Stats response not OK:', statsResponse.status, statsResponse.statusText);
      } else {
        console.error('Stats request failed completely (network error)');
      }

      // Handle status response
      if (statusResponse?.ok) {
        const statusText = await statusResponse.text();
        console.log('Synology status raw response:', statusText);
        
        if (statusText.trim()) {
          try {
            const statusData = JSON.parse(statusText);
            console.log('Synology status parsed data:', statusData);
            setStatus(statusData);
          } catch (parseError) {
            console.error('Failed to parse status JSON:', parseError);
            console.error('Raw status response that failed to parse:', statusText);
          }
        } else {
          console.error('Empty response from status endpoint');
        }
      } else if (statusResponse) {
        console.error('Status response not OK:', statusResponse.status, statusResponse.statusText);
      } else {
        console.error('Status request failed completely (network error)');
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

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
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

  if (loading && !stats && !status) {
    return (
      <Card className="w-full">
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
    <Card className="w-full">
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
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Server className="h-3 w-3" />
                Model
              </div>
              <div className="font-medium">
                {stats?.system?.model || status?.data?.model || 'Unknown'}
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Clock className="h-3 w-3" />
                Uptime
              </div>
              <div className="font-medium">
                {stats?.system?.uptime ? formatUptime(stats.system.uptime) : 
                 status?.data?.uptime || 'Unknown'}
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

            {/* Memory Usage */}
            {stats.memory && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <MemoryStick className="h-3 w-3" />
                    Memory
                  </div>
                  <span className="font-medium">
                    {formatBytes(stats.memory.used || 0)} / {formatBytes(stats.memory.total || 0)}
                  </span>
                </div>
                <Progress value={stats.memory.usage || 0} className="h-2" />
                <div className="text-xs text-muted-foreground text-right">
                  {(stats.memory.usage || 0).toFixed(1)}% used
                </div>
              </div>
            )}

            {/* Storage Usage */}
            {stats.disk && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <HardDrive className="h-3 w-3" />
                    Storage
                  </div>
                  <span className="font-medium">
                    {formatBytes(stats.disk.used || 0)} / {formatBytes(stats.disk.total || 0)}
                  </span>
                </div>
                <Progress value={stats.disk.usage || 0} className="h-2" />
                <div className="text-xs text-muted-foreground text-right">
                  {(stats.disk.usage || 0).toFixed(1)}% used
                </div>
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