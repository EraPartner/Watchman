import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { 
  HardDrive, 
  Cpu, 
  Thermometer, 
  Activity, 
  Clock, 
  Server,
  MemoryStick,
  Network,
  AlertCircle,
  CheckCircle,
  RefreshCw
} from 'lucide-react';

interface SynologyData {
  status: string;
  timestamp: string;
  system: {
    name: string;
    uptime: number;
    model: string;
    version: string;
    status: string;
  };
  cpu: {
    usage: number;
    temperature: number;
  };
  memory: {
    total: number;
    available: number;
    used: number;
    usage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  network: {
    bytesReceived: number;
    bytesTransmitted: number;
  };
  lastUpdated: string;
}

interface HealthData {
  status: string;
  timestamp: string;
  data?: {
    name: string;
    model: string;
    version: string;
    uptime: string;
    systemStatus: string;
  };
  error?: string;
}

const SynologyCard = () => {
  const [data, setData] = useState<SynologyData | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [statsResponse, healthResponse] = await Promise.all([
        fetch('/api/synology/stats'),
        fetch('/api/synology/status')
      ]);

      // Check if responses are ok and contain JSON
      if (!statsResponse.ok || !healthResponse.ok) {
        const statsError = !statsResponse.ok ? `Stats API returned ${statsResponse.status}` : '';
        const healthError = !healthResponse.ok ? `Status API returned ${healthResponse.status}` : '';
        throw new Error(`API Error: ${statsError} ${healthError}`.trim());
      }

      // Safely parse JSON with error handling for each response
      let statsData = null;
      let healthData = null;

      try {
        const statsText = await statsResponse.text();
        if (statsText.trim()) {
          statsData = JSON.parse(statsText);
        } else {
          console.warn('Empty stats response received');
        }
      } catch (parseError) {
        console.error('Failed to parse stats JSON:', parseError);
        // Set a fallback object for stats
        statsData = {
          status: 'error',
          error: 'Failed to parse stats data',
          timestamp: new Date().toISOString()
        };
      }

      try {
        const healthText = await healthResponse.text();
        if (healthText.trim()) {
          healthData = JSON.parse(healthText);
        } else {
          console.warn('Empty health response received');
        }
      } catch (parseError) {
        console.error('Failed to parse health JSON:', parseError);
        // Set a fallback object for health
        healthData = {
          status: 'offline',
          error: 'Failed to parse health data',
          timestamp: new Date().toISOString()
        };
      }

      // Only set data if we got valid responses
      if (statsData) setData(statsData);
      if (healthData) setHealth(healthData);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching Synology data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-500';
      case 'offline':
        return 'bg-red-500';
      case 'error':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <CheckCircle className="h-4 w-4" />;
      case 'offline':
      case 'error':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  if (loading && !data) {
    return (
      <Card className="col-span-1">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Server className="h-4 w-4" />
            Synology NAS
          </CardTitle>
          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <div className="text-sm text-muted-foreground">Loading...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data || !health) {
    return (
      <Card className="col-span-1">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Server className="h-4 w-4" />
            Synology NAS
          </CardTitle>
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Offline
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <div className="text-sm text-muted-foreground">
              {error || 'Failed to connect to Synology NAS'}
            </div>
            <button 
              onClick={fetchData}
              className="mt-2 text-xs text-blue-500 hover:text-blue-700"
              disabled={loading}
            >
              Retry
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isOnline = health.status === 'online' && data.status === 'online';
  const systemInfo = health.data || data.system;

  return (
    <Card className="col-span-1">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Server className="h-4 w-4" />
          Synology NAS
        </CardTitle>
        <Badge 
          variant={isOnline ? "default" : "destructive"} 
          className={`flex items-center gap-1 ${getStatusColor(health.status)}`}
        >
          {getStatusIcon(health.status)}
          {health.status}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* System Information */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Server className="h-3 w-3" />
              Model
            </div>
            <div className="font-medium">{systemInfo.model || 'Unknown'}</div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              Uptime
            </div>
            <div className="font-medium">{systemInfo.uptime || 'Unknown'}</div>
          </div>
        </div>

        {isOnline && data && (
          <>
            {/* CPU Usage */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Cpu className="h-3 w-3" />
                  CPU Usage
                </div>
                <div className="font-medium">{data.cpu.usage}%</div>
              </div>
              <Progress value={data.cpu.usage} className="h-1" />
            </div>

            {/* CPU Temperature */}
            {data.cpu.temperature > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Thermometer className="h-3 w-3" />
                    CPU Temperature
                  </div>
                  <div className="font-medium">{data.cpu.temperature}°C</div>
                </div>
                <Progress 
                  value={Math.min(data.cpu.temperature, 100)} 
                  className="h-1"
                />
              </div>
            )}

            {/* Memory Usage */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <MemoryStick className="h-3 w-3" />
                  Memory
                </div>
                <div className="font-medium">
                  {formatBytes(data.memory.used)} / {formatBytes(data.memory.total)}
                </div>
              </div>
              <Progress value={data.memory.usage} className="h-1" />
              <div className="text-xs text-muted-foreground text-right">
                {data.memory.usage}% used
              </div>
            </div>

            {/* Disk Usage */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <HardDrive className="h-3 w-3" />
                  Storage
                </div>
                <div className="font-medium">
                  {formatBytes(data.disk.used)} / {formatBytes(data.disk.total)}
                </div>
              </div>
              <Progress value={data.disk.usage} className="h-1" />
              <div className="text-xs text-muted-foreground text-right">
                {data.disk.usage}% used ({formatBytes(data.disk.free)} free)
              </div>
            </div>

            {/* Network Stats */}
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Network className="h-3 w-3" />
                Network
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted rounded p-2">
                  <div className="text-muted-foreground">RX</div>
                  <div className="font-medium">{formatBytes(data.network.bytesReceived)}</div>
                </div>
                <div className="bg-muted rounded p-2">
                  <div className="text-muted-foreground">TX</div>
                  <div className="font-medium">{formatBytes(data.network.bytesTransmitted)}</div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Last Updated */}
        <div className="text-xs text-muted-foreground text-center pt-2 border-t">
          Last updated: {new Date(health.timestamp).toLocaleTimeString()}
        </div>
      </CardContent>
    </Card>
  );
};

export default SynologyCard;
