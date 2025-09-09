import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Shield, Clock, AlertTriangle, ExternalLink } from 'lucide-react';
import { AdGuardServerStats, ServerStatus } from '../types/server';

interface AdGuardCardProps {
  name: string;
  status: ServerStatus;
  stats: AdGuardServerStats;
  ip: string;
  port?: number;
  lastSeen: Date;
}

export const AdGuardCard = ({ 
  name, 
  status, 
  stats, 
  ip, 
  port, 
  lastSeen 
}: AdGuardCardProps) => {
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
    const url = `http://${ip}:${port || 3000}`;
    window.open(url, '_blank');
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Shield className="h-4 w-4" />
          {name}
        </CardTitle>
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
      
      <CardContent className="space-y-4">
        {/* Connection Info */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <button
            onClick={handleUrlClick}
            className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline transition-colors"
            title="Open AdGuard web interface"
          >
            <span>{ip}:{port || 3000}</span>
            <ExternalLink className="h-3 w-3" />
          </button>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {lastSeenText}
          </span>
        </div>

        {/* DNS Query Stats */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">DNS Queries (24h)</span>
            <span className="text-sm text-muted-foreground">
              {formatNumber(stats.totalQueries)} total
            </span>
          </div>
          
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-green-600">Allowed: {formatNumber(stats.allowedQueries)}</span>
              <span className="text-red-600">Blocked: {formatNumber(stats.blockedQueries)}</span>
            </div>
            <Progress 
              value={stats.blockingRate} 
              className="h-2"
            />
            <div className="text-xs text-center text-muted-foreground">
              {stats.blockingRate}% blocked
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Version: {stats.version}</span>
        </div>

        {/* Top Domains */}
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Top blocked:</span>
            <span className="font-mono">{stats.topBlockedDomain}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Top queried:</span>
            <span className="font-mono">{stats.topQueriedDomain}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};