// ...existing code...
import React, { useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ServerStatusBadge } from './ServerStatusBadge';
import { Server, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/ApiClient';
import { Button } from './ui/button';
import { formatDisplayUrl, buildHref, openHref } from '../lib/url';

interface RouterCardProps {
  name: string; // display name
  serviceKey: string; // key used in backend services health (e.g. 'beryl' | 'telenet')
}

const RouterCard: React.FC<RouterCardProps> = ({ name, serviceKey }) => {
  // Reuse the shared services health endpoint (react-query will dedupe)
  const healthQuery = useQuery({
    queryKey: ['services','health'],
    queryFn: () => apiClient.getServicesHealth(),
    refetchInterval: 30000,
    retry: 1,
  });

  const frontendCfgQuery = useQuery({
    queryKey: ['frontend','config'],
    queryFn: () => apiClient.getFrontendConfig(),
    refetchInterval: 60000,
    retry: 1,
  });

  const serviceObj = healthQuery.data?.services ? (healthQuery.data.services as Record<string, any>)[serviceKey] : null;

  const status = serviceObj ? (serviceObj.status as string) : (healthQuery.isLoading ? 'loading' : 'not_configured');
  const responseTime = serviceObj?.responseTime ?? serviceObj?.response_time ?? null;
  const lastCheck = serviceObj?.lastCheck ?? serviceObj?.timestamp ?? null;
  const error = serviceObj?.error ?? null;

  // Try to read a host/port from frontend config if backend exposes it under services.<serviceKey>
  const frontendServiceCfg = (frontendCfgQuery.data as any)?.services?.[serviceKey];
  // Prefer host reported by the service health endpoint (serviceObj.host), fallback to frontend config
  const displayHost = useMemo(() => {
    if (serviceObj && serviceObj.host) return String(serviceObj.host);
    if (frontendServiceCfg && (frontendServiceCfg.host || frontendServiceCfg.ip || frontendServiceCfg.webUrl)) {
      if (frontendServiceCfg.webUrl) return formatDisplayUrl(frontendServiceCfg.webUrl);
      const candidate = frontendServiceCfg.host || frontendServiceCfg.ip;
      return candidate ? String(candidate) : null;
    }
    return null;
  }, [serviceObj, frontendServiceCfg]);

  const onRetry = useCallback(() => {
    healthQuery.refetch();
    frontendCfgQuery.refetch();
  }, [healthQuery, frontendCfgQuery]);

  const isOnline = status === 'online';
  const hasError = status === 'warning' || status === 'error' || status === 'not_configured';

  return (
    <Card className="w-full">
      <CardHeader className="flex items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Server className="h-4 w-4" />
          {name}
        </CardTitle>
        <ServerStatusBadge status={healthQuery.isLoading ? 'loading' : isOnline ? 'online' : hasError ? 'warning' : 'offline'} />
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Basic info row */}
        <div className="text-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span>Host</span>
            </div>
            <div className="text-sm font-medium truncate">
              {displayHost ? (
                <button
                  onClick={() => openHref(buildHref(displayHost, true))}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                >
                  <span className="truncate">{displayHost}</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              ) : (
                <span className="text-muted-foreground">Unknown</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-muted-foreground">Status</div>
            <div className={`text-sm font-medium ${isOnline ? 'text-green-600' : hasError ? 'text-yellow-600' : 'text-red-600'}`}>{status}</div>
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-muted-foreground">Response</div>
            <div className="text-sm font-mono">
              {serviceObj && serviceObj.icmpAlive ? (
                responseTime ? `ICMP ${responseTime}ms` : 'ICMP alive'
              ) : (
                'N/A'
              )}
            </div>
          </div>

          {lastCheck && (
            <div className="text-xs text-muted-foreground mt-2">Last: {new Date(lastCheck).toLocaleString()}</div>
          )}

          {error && (
            <div className="mt-3 text-xs text-red-600 bg-red-50 rounded p-2 flex items-start gap-2">
              <AlertCircle className="h-4 w-4" />
              <div className="truncate">{String(error)}</div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onRetry}>
            <RefreshCw className={`h-4 w-4 ${healthQuery.isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default RouterCard;
// ...existing code...