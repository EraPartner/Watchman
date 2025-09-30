import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { AlertTriangle, ExternalLink, Shield, Zap, Hash, BarChart2, Link as LinkIcon, Database } from 'lucide-react';
import { TorServerStats, ServerStatus } from '../types/server';
import { RELAY_TYPE_COLORS, APP_CONFIG } from '../lib/constants';
import { ServerStatusBadge } from './ServerStatusBadge';
import { formatDisplayUrl, openHref } from '../lib/url';

// Tor Project logo SVG component
const TorIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2.5c5.238 0 9.5 4.262 9.5 9.5s-4.262 9.5-9.5 9.5S2.5 17.238 2.5 12 6.762 2.5 12 2.5z"
      fill="#7D4698"
    />
    <path
      d="M12 4.5c-4.136 0-7.5 3.364-7.5 7.5s3.364 7.5 7.5 7.5 7.5-3.364 7.5-7.5-3.364-7.5-7.5-7.5zm0 2c3.033 0 5.5 2.467 5.5 5.5s-2.467 5.5-5.5 5.5-5.5-2.467-5.5-5.5 2.467-5.5 5.5-5.5z"
      fill="#7D4698"
    />
    <path
      d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 1.5c1.381 0 2.5 1.119 2.5 2.5s-1.119 2.5-2.5 2.5-2.5-1.119-2.5-2.5 1.119-2.5 2.5-2.5z"
      fill="#7D4698"
    />
  </svg>
);

interface TorCardProps {
  name: string;
  status: ServerStatus;
  stats: TorServerStats;
  ip: string;
  port?: number;
}

export const TorCard = ({ 
  name, 
  status, 
  stats, 
  ip, 
  port
}: TorCardProps) => {
  const getRelayTypeColor = (relayType: string) => {
    return RELAY_TYPE_COLORS[relayType as keyof typeof RELAY_TYPE_COLORS] || 'text-gray-600';
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

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex flex-col">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TorIcon className="h-4 w-4 text-[#7D4698]" />
            {name}
            {stats.nickname && (
              <span className="text-xs text-muted-foreground">({stats.nickname})</span>
            )}
          </CardTitle>
          {/* Use the shared URL helper to format and open the metrics link */}
          <button
            onClick={() => openHref(`${APP_CONFIG.TOR_METRICS_BASE_URL}/${stats.nickname}`)}
            className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors flex items-center gap-1 mt-1 w-fit"
            title="View relay details on Tor Metrics"
          >
            <span className="truncate">{formatDisplayUrl(`${ip}:${port}`)}</span>
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <ServerStatusBadge status={status} />
          {stats.hibernating && (
            <div title="Relay is hibernating">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            </div>
          )}
          {!stats.flags?.includes('Running') && (
            <div title="Relay not running">
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Connection Info */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            {stats.orPort && (
              <span className="text-xs flex items-center gap-1"><Database className="h-3 w-3" />OR Port: {stats.orPort}</span>
            )}
          </div>
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
            <span className="flex items-center gap-1 text-muted-foreground"><Hash className="h-3 w-3" />Fingerprint:</span>
            <span className="font-mono text-xs">{stats.fingerprint?.slice(0, 16)}...</span>
          </div>
          {stats.consensusWeight && (
            <div className="flex justify-between">
              <span className="flex items-center gap-1 text-muted-foreground"><BarChart2 className="h-3 w-3" />Consensus Weight:</span>
              <span>{formatNumber(stats.consensusWeight)}</span>
            </div>
          )}
          {stats.exitPolicy && (
            <div className="flex justify-between">
              <span className="flex items-center gap-1 text-muted-foreground"><LinkIcon className="h-3 w-3" />Exit Policy:</span>
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