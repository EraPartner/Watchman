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
    // Prefer an explicit frontend-provided webUrl (includes non-default ports)
    if (frontendServiceCfg && frontendServiceCfg.webUrl) return formatDisplayUrl(frontendServiceCfg.webUrl);
    // Next prefer host from the service health object (same host but may not include port)
    if (serviceObj && serviceObj.host) return String(serviceObj.host);
    // Fallback to frontend config host/ip if available
    if (frontendServiceCfg && (frontendServiceCfg.host || frontendServiceCfg.ip)) {
      const candidate = frontendServiceCfg.host || frontendServiceCfg.ip;
      return candidate ? String(candidate) : null;
    }
    return null;
  }, [serviceObj, frontendServiceCfg]);

  // Build the href that should be opened when clicking the host link.
  // If backend provided a `webUrl` use it directly (preserves port). Otherwise fallback to displayHost and buildHref.
  const hostHref = useMemo(() => {
    if (frontendServiceCfg && frontendServiceCfg.webUrl) {
      const raw = String(frontendServiceCfg.webUrl);
      // If it already has a scheme, return as-is; otherwise build with http
      const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw);
      return hasScheme ? raw : `http://${raw}`;
    }
    if (serviceObj && serviceObj.host) return buildHref(String(serviceObj.host), false);
    if (frontendServiceCfg && (frontendServiceCfg.host || frontendServiceCfg.ip)) {
      const candidate = frontendServiceCfg.host || frontendServiceCfg.ip;
      return buildHref(String(candidate), false);
    }
    return null;
  }, [frontendServiceCfg, serviceObj]);

  // Additional HTTP fallback URL if available
  const httpFallbackHref = useMemo(() => {
    if (frontendServiceCfg && frontendServiceCfg.webUrl) {
      const raw = String(frontendServiceCfg.webUrl);
      // If the URL has a scheme and is not http, offer an http fallback
      const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw);
      if (hasScheme && !raw.startsWith('http://')) {
        // Replace https:// with http:// for the fallback
        return raw.replace(/^https:\/\//i, 'http://');
      }
    }
    return null;
  }, [frontendServiceCfg]);

  const onRetry = useCallback(() => {
    healthQuery.refetch();
    frontendCfgQuery.refetch();
  }, [healthQuery, frontendCfgQuery]);

  const isOnline = status === 'online';
  const hasError = status === 'warning' || status === 'error' || status === 'not_configured';

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2 justify-start">
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openHref(hostHref)}
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                  >
                    <span className="truncate">{displayHost}</span>
                    <ExternalLink className="h-3 w-3" />
                  </button>
                  {/* If we have an explicit http fallback that differs from the primary href, show a tiny fallback button */}
                  {httpFallbackHref && httpFallbackHref !== hostHref && (
                    <button
                      onClick={() => openHref(httpFallbackHref)}
                      title="Open HTTP fallback"
                      className="text-xs text-muted-foreground hover:text-gray-700"
                    >
                      (https)
                    </button>
                  )}
                </div>
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