import { memo, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useServiceHealth, useServiceStats } from '@/hooks/useServiceHealth';
import { Activity, RefreshCw, ExternalLink, Cpu, Thermometer, AlertTriangle, Server, Clock, HardDrive } from 'lucide-react';
import { ServerStatusBadge } from './ServerStatusBadge';
import { buildHref, openHref } from '../lib/url';
import ServiceLink from '@/components/ServiceLink';

interface MacMiniCardProps {
  serviceName?: string; // defaults to 'macmini' to match backend route
  displayName?: string;
  enableStats?: boolean;
  webUrl?: string;
  priority?: 'high' | 'medium' | 'low';
}

export const MacMiniCard = memo<MacMiniCardProps>(({ 
  serviceName = 'macmini',
  displayName = 'Mac Mini',
  enableStats = true,
  webUrl,
  priority = 'medium'
}) => {
  const { 
    data: health, 
    isLoading: healthLoading, 
    error: healthError,
    refetch: refetchHealth 
  } = useServiceHealth(serviceName, {
    refetchInterval: priority === 'high' ? 5000 : priority === 'medium' ? 10000 : 20000,
    enabled: true,
    staleTime: priority === 'high' ? 2000 : 5000,
  });

  const { data: stats, isLoading: statsLoading } = useServiceStats(serviceName, enableStats);

  const statusMetrics = useMemo(() => {
    if (!health) return null;

    const getStatusColor = (status: string) => {
      switch (status) {
        case 'online': return 'bg-green-500 text-green-50';
        case 'offline': return 'bg-red-500 text-red-50';
        case 'warning': return 'bg-yellow-500 text-yellow-50';
        default: return 'bg-gray-500 text-gray-50';
      }
    };

    return {
      statusColor: getStatusColor(health.status as any),
      isHealthy: health.status === 'online',
    };
  }, [health]);

  const formattedStats = useMemo(() => {
    if (!stats || !enableStats) return null;

    const entries: { key: string; value: string; isImportant?: boolean }[] = [];

    // CPU load (may be 1m/5m/15m or single value)
    if (stats.cpuLoad != null) {
      const v = typeof stats.cpuLoad === 'number' ? `${stats.cpuLoad}%` : String(stats.cpuLoad);
      entries.push({ key: 'cpu load', value: v, isImportant: true });
    }

    // CPU temperature
    if (stats.cpuTemp != null) {
      entries.push({ key: 'cpu temp', value: `${stats.cpuTemp}°C`, isImportant: true });
    }

    // Disk usage - show used/total and percent if available
    if (stats.disk) {
      if (typeof stats.disk === 'object') {
        const total = stats.disk.total != null ? humanBytes(stats.disk.total) : 'N/A';
        const used = stats.disk.used != null ? humanBytes(stats.disk.used) : 'N/A';
        const percent = stats.disk.usagePercent != null ? `${stats.disk.usagePercent}%` : (stats.disk.used && stats.disk.total ? `${Math.round((stats.disk.used / stats.disk.total) * 100)}%` : 'N/A');
        entries.push({ key: 'disk used', value: `${used} / ${total}`, isImportant: true });
      }
    }

    // Uptime or load average
    if (stats.uptime != null) {
      entries.push({ key: 'uptime', value: formatUptime(stats.uptime), isImportant: false });
    }

    return entries;
  }, [stats, enableStats]);

  const isLoading = healthLoading || (enableStats && statsLoading);
  const hasError = !!healthError;

  return (
    <Card className={`h-full transition-all duration-300 hover:shadow-lg border-l-4 ${
      statusMetrics?.isHealthy ? 'border-l-green-500 hover:border-l-green-600' : 'border-l-red-500 hover:border-l-red-600'
    }`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg font-semibold">{displayName}</CardTitle>
          </div>
          {statusMetrics && (
            <ServerStatusBadge status={(health?.status as any) || (health ? 'offline' : 'loading')} />
          )}
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {statusMetrics?.isHealthy ? 'reachable' : 'unreachable'}
          </Badge>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetchHealth()}
            disabled={isLoading}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          {webUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openHref(buildHref(webUrl, true))}
              className="h-8 w-8 p-0"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
              <span className="text-sm text-muted-foreground">Loading...</span>
            </div>
          </div>
        ) : hasError ? (
          <div className="flex items-center gap-2 py-4 text-red-600 bg-red-50 rounded-lg px-3">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">Failed to load: {String((healthError as any)?.message || 'Unknown error')}</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              <Activity className="h-4 w-4" />
              <span className="text-sm font-medium flex items-center gap-1"><Server className="h-3 w-3" /> Status:</span>
              <span className="text-sm">{health?.status || 'Unknown'}</span>
              {/* Show configured host/IP when available (from health data or stats) */}
              {((health as any)?.data?.host || (stats as any)?.host) && (
                <span className="text-xs text-muted-foreground ml-2">IP: {(health as any)?.data?.host || (stats as any)?.host}</span>
              )}
              {health?.lastCheck && (
                <span className="text-xs text-muted-foreground ml-auto">{new Date(health.lastCheck).toLocaleTimeString()}</span>
              )}
            </div>

            {formattedStats && formattedStats.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {formattedStats.map(({ key, value, isImportant }) => (
                  <div key={key} className={`p-2 rounded border text-center ${isImportant ? 'bg-primary/5 border-primary/20' : 'bg-muted/30'}`}>
                    <div className="text-xs text-muted-foreground truncate flex items-center gap-1" title={key}>
                      {key.includes('cpu') ? <Cpu className="h-3 w-3" /> : key.includes('temp') ? <Thermometer className="h-3 w-3" /> : key.includes('uptime') ? <Clock className="h-3 w-3" /> : <HardDrive className="h-3 w-3" />}
                      {key}
                    </div>
                    <div className={`text-sm font-mono ${isImportant ? 'font-semibold' : ''}`}>{value}</div>
                  </div>
                ))}
              </div>
            )}

            {!formattedStats && (
              <div className="text-sm text-muted-foreground">No stats available</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

MacMiniCard.displayName = 'MacMiniCard';

// Utility helpers
function humanBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return 'N/A';
  const thresh = 1024;
  if (Math.abs(bytes) < thresh) return bytes + ' B';
  const units = ['KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  let u = -1;
  do {
    bytes /= thresh;
    ++u;
  } while (Math.abs(bytes) >= thresh && u < units.length - 1);
  return bytes.toFixed(1) + ' ' + units[u];
}

function formatUptime(seconds: number) {
  if (!Number.isFinite(seconds)) return 'N/A';
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (parts.length === 0) return `${Math.floor(seconds)}s`;
  return parts.join(' ');
}