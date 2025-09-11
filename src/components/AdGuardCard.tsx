import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Shield, Clock, AlertTriangle, ExternalLink, Activity, Globe, Zap } from 'lucide-react';
import { AdGuardServerStats, ServerStatus } from '../types/server';
import { useConfig } from '../hooks/use-config';

// AdGuard Home logo SVG component
const AdGuardIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M12 0L2 5v6.09c0 7.05 4.84 13.64 10 15.41 5.16-1.77 10-8.36 10-15.41V5L12 0zm0 22c-4.07-1.42-8-6.78-8-12.91V6.09L12 2.5l8 3.59v2.91c0 6.13-3.93 11.49-8 12.91z"
      fill="#67C93F"
    />
    <path
      d="M12 4L5 7v4.09c0 5.64 3.87 10.91 7 12.41 3.13-1.5 7-6.77 7-12.41V7L12 4z"
      fill="#67C93F"
    />
  </svg>
);

interface AdGuardCardProps {
  name: string;
  status: ServerStatus;
  stats: AdGuardServerStats;
  lastSeen: Date;
}

export const AdGuardCard = ({ 
  name, 
  status, 
  stats, 
  lastSeen 
}: AdGuardCardProps) => {
  const [currentTime, setCurrentTime] = useState(Date.now());
  const { config } = useConfig();

  // Update current time every second for live timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const getStatusVariant = (status: ServerStatus) => {
    switch (status) {
      case 'online': return 'default';
      case 'warning': return 'secondary';
      case 'offline': return 'destructive';
      case 'maintenance': return 'outline';
      default: return 'secondary';
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const formatPercentage = (rate: number) => {
    return `${rate.toFixed(1)}%`;
  };

  const formatProcessingTime = (time: number, units: string) => {
    if (time === 0) return 'N/A';
    return `${time.toFixed(1)}${units === 'milliseconds' ? 'ms' : units.charAt(0)}`;
  };

  const timeSinceLastSeen = Math.floor((currentTime - lastSeen.getTime()) / 1000);
  const lastSeenText = timeSinceLastSeen < 60 
    ? `${timeSinceLastSeen}s ago`
    : timeSinceLastSeen < 3600
    ? `${Math.floor(timeSinceLastSeen / 60)}m ago`
    : `${Math.floor(timeSinceLastSeen / 3600)}h ago`;

  const handleUrlClick = () => {
    const adguardWebUrl = config?.services.adguard.webUrl || 'http://127.0.0.1:5213';
    window.open(adguardWebUrl, '_blank');
  };

  const displayUrl = (config?.services.adguard.webUrl || 'http://127.0.0.1:5213')
    .replace(/^https?:\/\//, '');

  // Calculate total blocked from all protection types
  const totalProtectionBlocked = (stats.safebrowsingBlocked || 0) + 
                                (stats.safesearchBlocked || 0) + 
                                (stats.parentalBlocked || 0);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex flex-col">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AdGuardIcon className="h-4 w-4" />
            {name}
          </CardTitle>
          <button
            onClick={handleUrlClick}
            className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors flex items-center gap-1 mt-1 w-fit"
            title="Open AdGuard web interface"
          >
            <span>{displayUrl}</span>
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Badge 
            variant={getStatusVariant(status)} 
            className={`capitalize ${status === 'online' ? 'bg-green-600 text-white hover:bg-green-700' : ''}`}
          >
            {status}
          </Badge>
          {!stats.protectionEnabled && (
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* Status and Version Info */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="text-xs text-gray-500">Version</div>
            <div className="font-mono font-semibold text-sm">{stats.version}</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-gray-500">Last Seen</div>
            <div className="font-mono font-semibold text-sm flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {lastSeenText}
            </div>
          </div>
        </div>

        {/* DNS Query Stats - Enhanced */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <Globe className="h-3 w-3" />
              DNS Queries (24h)
            </div>
            <span className="text-sm font-semibold">
              {formatNumber(stats.totalQueries)}
            </span>
          </div>
          
          {/* Query breakdown */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="text-center p-2 bg-green-50 rounded">
              <div className="font-mono font-semibold text-green-600">{formatNumber(stats.allowedQueries)}</div>
              <div className="text-gray-500">Allowed</div>
            </div>
            <div className="text-center p-2 bg-red-50 rounded">
              <div className="font-mono font-semibold text-red-600">{formatNumber(stats.blockedQueries)}</div>
              <div className="text-gray-500">Blocked</div>
            </div>
          </div>

          {/* Blocking rate progress */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Blocking Rate</span>
              <span>{formatPercentage(stats.blockingRate)}</span>
            </div>
            <Progress 
              value={stats.blockingRate} 
              className="h-2"
            />
          </div>
        </div>

        {/* Protection Features */}
        {totalProtectionBlocked > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Protection Features
            </div>
            <div className="grid grid-cols-3 gap-1 text-xs">
              {stats.safebrowsingBlocked > 0 && (
                <div className="text-center p-1 bg-orange-50 rounded">
                  <div className="font-mono font-semibold text-orange-600">{formatNumber(stats.safebrowsingBlocked)}</div>
                  <div className="text-gray-500 text-[10px]">Malware</div>
                </div>
              )}
              {stats.safesearchBlocked > 0 && (
                <div className="text-center p-1 bg-purple-50 rounded">
                  <div className="font-mono font-semibold text-purple-600">{formatNumber(stats.safesearchBlocked)}</div>
                  <div className="text-gray-500 text-[10px]">SafeSearch</div>
                </div>
              )}
              {stats.parentalBlocked > 0 && (
                <div className="text-center p-1 bg-blue-50 rounded">
                  <div className="font-mono font-semibold text-blue-600">{formatNumber(stats.parentalBlocked)}</div>
                  <div className="text-gray-500 text-[10px]">Parental</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Performance */}
        <div className="space-y-1">
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <Activity className="h-3 w-3" />
            Performance
          </div>
          <div className="flex justify-between items-center">
            <div className="text-xs text-gray-500">Avg Response Time</div>
            <div className="font-mono font-semibold text-sm flex items-center gap-1">
              <Zap className="h-3 w-3 text-yellow-500" />
              {formatProcessingTime(stats.avgProcessingTime, stats.timeUnits || 'ms')}
            </div>
          </div>
        </div>

        {/* Top Domains */}
        <div className="space-y-1">
          <div className="text-xs text-gray-500">Top Domains</div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Most Blocked:</span>
              <span className="font-mono text-red-600 truncate ml-2 max-w-[120px]" title={stats.topBlockedDomain}>
                {stats.topBlockedDomain}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Most Queried:</span>
              <span className="font-mono text-blue-600 truncate ml-2 max-w-[120px]" title={stats.topQueriedDomain}>
                {stats.topQueriedDomain}
              </span>
            </div>
            {stats.topClient && stats.topClient !== 'N/A' && (
              <div className="flex justify-between">
                <span className="text-gray-500">Top Client:</span>
                <span className="font-mono text-gray-700 truncate ml-2 max-w-[120px]" title={stats.topClient}>
                  {stats.topClient}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Status indicators */}
        <div className="flex gap-2 text-xs">
          <div className={`px-2 py-1 rounded-full ${
            stats.protectionEnabled 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {stats.protectionEnabled ? 'Protected' : 'Unprotected'}
          </div>
          <div className={`px-2 py-1 rounded-full ${
            stats.running 
              ? 'bg-blue-100 text-blue-800' 
              : 'bg-gray-100 text-gray-800'
          }`}>
            {stats.running ? 'Running' : 'Stopped'}
          </div>
          {stats.blockingRate > 50 && (
            <div className="px-2 py-1 rounded-full bg-orange-100 text-orange-800">
              High Block Rate
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};