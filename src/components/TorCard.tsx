import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Globe, Clock, AlertTriangle, ExternalLink, Shield, Zap } from 'lucide-react';
import { TorServerStats, ServerStatus } from '../types/server';

interface TorCardProps {
  name: string;
  status: ServerStatus;
  stats: TorServerStats;
  ip: string;
  port?: number;
  lastSeen: Date;
}

export const TorCard = ({ 
  name, 
  status, 
  stats, 
  ip, 
  port, 
  lastSeen 
}: TorCardProps) => {
  const [currentTime, setCurrentTime] = useState(Date.now());

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

  const getRelayTypeColor = (relayType: string) => {
    switch (relayType) {
      case 'exit': return 'text-red-600';
      case 'relay': return 'text-blue-600';
      case 'bridge': return 'text-purple-600';
      case 'client': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  const formatBandwidth = (kbps: number) => {
    if (kbps >= 1024) {
      return `${(kbps / 1024).toFixed(1)} MB/s`;
    }
    return `${kbps.toFixed(1)} KB/s`;
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

  const timeSinceLastSeen = Math.floor((currentTime - lastSeen.getTime()) / 1000);
  const lastSeenText = timeSinceLastSeen < 60 
    ? `${timeSinceLastSeen}s ago`
    : timeSinceLastSeen < 3600
    ? `${Math.floor(timeSinceLastSeen / 60)}m ago`
    : `${Math.floor(timeSinceLastSeen / 3600)}h ago`;

  const handleUrlClick = () => {
    const defaultPort = parseInt(import.meta.env.VITE_TOR_DEFAULT_PORT || '9001');
    const url = `http://${ip}:${stats.orPort || defaultPort}`;
    window.open(url, '_blank');
  };

  const handleMetricsClick = () => {
    const metricsUrl = import.meta.env.VITE_TOR_METRICS_URL || 'https://metrics.torproject.org';
    const nickname = stats.nickname || import.meta.env.VITE_TOR_RELAY_NICKNAME || 'torrelaytor';
    const url = `${metricsUrl}/rs.html#search/${nickname}`;
    window.open(url, '_blank');
  };

  const importantFlags = stats.flags?.filter(flag => 
    ['Guard', 'Exit', 'Fast', 'Stable', 'Running', 'Valid', 'Authority'].includes(flag)
  ) || [];

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Globe className="h-4 w-4" />
          {name}
          {stats.nickname && (
            <span className="text-xs text-muted-foreground">({stats.nickname})</span>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge 
            variant={getStatusVariant(status)} 
            className={`capitalize ${status === 'online' ? 'bg-green-600 text-white hover:bg-green-700' : ''}`}
          >
            {status}
          </Badge>
          {stats.hibernating && (
            <AlertTriangle className="h-4 w-4 text-yellow-500" title="Relay is hibernating" />
          )}
          {!stats.flags?.includes('Running') && (
            <AlertTriangle className="h-4 w-4 text-red-500" title="Relay not running" />
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Connection Info */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <a 
              href={`https://metrics.torproject.org/rs.html#search/${stats.nickname || 'torrelaytor'}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline transition-colors"
              title="View relay details on Tor Metrics"
            >
              <span>Control: {ip}:{port}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
            {stats.orPort && (
              <span className="text-xs">• OR: {stats.orPort}</span>
            )}
          </div>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {lastSeenText}
          </span>
        </div>

        {/* Relay Type & Basic Info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Type:</span>
            <Badge 
              variant="outline" 
              className={`${getRelayTypeColor(stats.relayType)} capitalize border-current`}
            >
              {stats.relayType}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            v{stats.version}
          </span>
        </div>

        {/* Bandwidth Stats */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Bandwidth
            </span>
            <span className="text-sm text-muted-foreground">
              {formatBandwidth(stats.bandwidth.current)} current
            </span>
          </div>
          
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-blue-600">Avg: {formatBandwidth(stats.bandwidth.average)}</span>
              <span className="text-green-600">Burst: {formatBandwidth(stats.bandwidth.burst)}</span>
            </div>
            <Progress 
              value={Math.min((stats.bandwidth.current / stats.bandwidth.burst) * 100, 100)} 
              className="h-2"
            />
            <div className="text-xs text-center text-muted-foreground">
              {Math.round((stats.bandwidth.current / stats.bandwidth.burst) * 100)}% of burst capacity
            </div>
          </div>
        </div>

        {/* Relay Flags */}
        {stats.flags && stats.flags.length > 0 && (
          <div className="space-y-2">
            <span className="text-sm font-medium flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Relay Flags
            </span>
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
              {stats.flags.map((flag) => (
                <Badge key={flag} variant="secondary" className="text-xs whitespace-nowrap flex-shrink-0">
                  {flag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Additional Info */}
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Fingerprint:</span>
            <span className="font-mono text-xs">{stats.fingerprint?.slice(0, 16)}...</span>
          </div>
          {stats.consensusWeight && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Consensus Weight:</span>
              <span>{formatNumber(stats.consensusWeight)}</span>
            </div>
          )}
          {stats.exitPolicy && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Exit Policy:</span>
              <span className="text-xs truncate max-w-24" title={stats.exitPolicy}>
                {stats.exitPolicy.length > 20 ? stats.exitPolicy.slice(0, 20) + '...' : stats.exitPolicy}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};