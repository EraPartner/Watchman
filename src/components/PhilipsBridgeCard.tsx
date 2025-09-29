import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Server, AlertCircle, RefreshCw, Network, ExternalLink } from 'lucide-react';
import { ServerStatusBadge } from './ServerStatusBadge';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/ApiClient';
import { APP_CONFIG } from '../lib/constants';
import { formatDisplayUrl, buildHref, openHref } from '../lib/url';

const formatPingDisplay = (ping?: boolean | null) => {
  if (ping === true) return 'ICMP: Responding';
  if (ping === false) return 'ICMP: No response';
  return 'ICMP: N/A';
};

const PhilipsBridgeCard: React.FC = () => {
  const statusQuery = useQuery({
    queryKey: ['philips', 'status'],
    queryFn: () => apiClient.getPhilipsStatus(),
    refetchInterval: APP_CONFIG.ROON_REFRESH_INTERVAL,
    retry: 1,
  });

  const statsQuery = useQuery({
    queryKey: ['philips', 'stats'],
    queryFn: () => apiClient.getPhilipsStats(),
    refetchInterval: APP_CONFIG.ROON_REFRESH_INTERVAL,
    retry: 1,
  });

  const loading = statusQuery.isLoading && statsQuery.isLoading;
  const status = statusQuery.data as any;
  const stats = statsQuery.data as any;

  const isOnline = status?.status === 'online' || stats?.status === 'online';
  const hasError = status?.status === 'error' || stats?.status === 'error';

  const hostValue = status?.data?.host || stats?.data?.host || null;
  let hostHref: string | null = null;
  if (hostValue) {
    try {
      let base = hostValue as string;
      if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
      const u = new URL(base);
      hostHref = u.toString();
    } catch (err) {
      hostHref = hostValue ? `http://${hostValue}` : null;
    }
  }

  if (loading && !status && !stats) {
    return (
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Server className="h-4 w-4" />
            Philips Bridge
          </CardTitle>
          <ServerStatusBadge status={loading ? 'loading' : isOnline ? 'online' : hasError ? 'error' : 'offline'} />
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
          Philips Bridge
        </CardTitle>
        <ServerStatusBadge status={loading ? 'loading' : isOnline ? 'online' : hasError ? 'error' : 'offline'} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 text-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Server className="h-3 w-3" />
              Host
            </div>
            <div className="font-medium">
              {hostHref ? (
                <button
                  onClick={() => openHref(hostHref)}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors flex items-center gap-1 mt-1 w-fit"
                  title={`Open ${hostValue} in new tab`}
                >
                  <span className="truncate">{formatDisplayUrl(hostValue)}</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              ) : (
                hostValue || 'Unknown'
              )}
            </div>
          </div>
        </div>

        {(stats?.data || status?.data) && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Network className="h-3 w-3" />
                Ping
              </div>
              <div className="text-right">
                <div className="font-medium">{formatPingDisplay(stats?.data?.ping ?? status?.data?.ping)}</div>
              </div>
            </div>
          </div>
        )}

        {!isOnline && !loading && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
            <div className="text-sm text-muted-foreground mb-2">{hasError ? 'Connection Error' : 'Philips Bridge is offline'}</div>
            {(status?.error || stats?.error) && (
              <div className="text-xs text-red-500 max-w-full break-words">{status?.error || stats?.error}</div>
            )}
          </div>
        )}

        <div className="text-xs text-muted-foreground text-center pt-3 border-t">Last updated: {new Date(status?.timestamp || stats?.timestamp || Date.now()).toLocaleTimeString()}</div>
      </CardContent>
    </Card>
  );
};

export default PhilipsBridgeCard;
