import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Server, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { ServerStatusBadge } from './ServerStatusBadge';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/ApiClient';
import { APP_CONFIG } from '../lib/constants';
import { formatDisplayUrl, buildHref, openHref } from '../lib/url';

const HomebridgeCard: React.FC = () => {
  // Status uses the new /api/status/homebridge endpoint
  const statusQuery = useQuery({
    queryKey: ['homebridge', 'status'],
    queryFn: () => apiClient.getStatusHomebridge(),
    refetchInterval: APP_CONFIG.ADGUARD_REFRESH_INTERVAL,
    retry: 1,
  });

  const statsQuery = useQuery({
    queryKey: ['homebridge', 'stats'],
    queryFn: () => apiClient.getHomebridgeStats(),
    refetchInterval: APP_CONFIG.ADGUARD_REFRESH_INTERVAL,
    retry: 1,
  });

  // Explicit version and server-information endpoints
  const versionQuery = useQuery({
    queryKey: ['homebridge', 'version'],
    queryFn: () => apiClient.getHomebridgeVersion(),
    refetchInterval: APP_CONFIG.ADGUARD_REFRESH_INTERVAL,
    retry: 1,
  });

  const serverInfoQuery = useQuery({
    queryKey: ['homebridge', 'server-information'],
    queryFn: () => apiClient.getHomebridgeServerInformation(),
    refetchInterval: APP_CONFIG.ADGUARD_REFRESH_INTERVAL,
    retry: 1,
  });

  const loading = (statusQuery.isLoading && statsQuery.isLoading);
  const status = statusQuery.data as any;
  const stats = statsQuery.data as any;
  const versionResp = versionQuery.data as any;
  const serverInfoResp = serverInfoQuery.data as any;

  const isOnline = status?.status === 'online' || stats?.status === 'online' || (versionResp && !versionResp.error);
  const hasError = status?.status === 'error' || stats?.status === 'error' || versionResp?.error || serverInfoResp?.error;

  // Try to find a usable host or web url
  const hostValue = (status?.data && (status.data.host || status.data.url || status.data.baseUrl)) || (stats?.data && (stats.data.host || stats.data.url)) || null;
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

  // Helper to extract a readable version string from various response shapes
  const extractVersion = () => {
    const vr = versionResp || stats?.data || status?.data;
    if (!vr) return null;
    if (typeof vr === 'object') {
      return vr.version || vr.homebridgeVersion || vr.homebridge_version || vr.serverVersion || vr.raw?.version || null;
    }
    if (typeof vr === 'string') return vr;
    return null;
  };

  const versionDisplay = extractVersion() || 'N/A';

  // Helper to pretty-print server information safely
  const renderServerInfo = () => {
    const resp = serverInfoQuery.isSuccess ? serverInfoResp : (status?.data || stats?.data || null);
    if (!resp) return 'N/A';

    const data = resp.data || resp;
    if (!data) return 'N/A';

    if (typeof data === 'string') return data;

    if (typeof data === 'object') {
      const possible: string[] = [];
      if (data.hostname) possible.push(`host: ${data.hostname}`);
      if (data.platform) possible.push(`platform: ${data.platform}`);
      if (data.homebridgeVersion) possible.push(`hb: ${data.homebridgeVersion}`);
      if (data.serverVersion) possible.push(`server: ${data.serverVersion}`);
      if (data.uptime) possible.push(`uptime: ${data.uptime}`);
      if (possible.length > 0) return possible.join(' · ');

      try {
        const json = JSON.stringify(data);
        return json.length > 200 ? json.slice(0, 197) + '...' : json;
      } catch (e) {
        return 'Unknown';
      }
    }

    return 'N/A';
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Server className="h-4 w-4" />
          Homebridge
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
                  onClick={() => openHref(buildHref(hostHref, true))}
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

        {(statusQuery.isSuccess || statsQuery.isSuccess || versionQuery.isSuccess || serverInfoQuery.isSuccess) && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground text-xs">Version</div>
              <div className="font-medium">{versionDisplay}</div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground text-xs">Server</div>
              <div className="font-medium text-right break-words max-w-[45%]">{renderServerInfo()}</div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground text-xs">Last seen</div>
              <div className="font-medium">{new Date(status?.timestamp || stats?.timestamp || versionResp?.timestamp || serverInfoResp?.timestamp || Date.now()).toLocaleTimeString()}</div>
            </div>
          </div>
        )}

        {!isOnline && !loading && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
            <div className="text-sm text-muted-foreground mb-2">{hasError ? 'Connection Error' : 'Homebridge is offline'}</div>
            {(status?.error || stats?.error || versionResp?.error || serverInfoResp?.error) && (
              <div className="text-xs text-red-500 max-w-full break-words">{status?.error || stats?.error || versionResp?.error || serverInfoResp?.error}</div>
            )}
          </div>
        )}

        <div className="text-xs text-muted-foreground text-center pt-3 border-t">Last updated: {new Date(status?.timestamp || stats?.timestamp || versionResp?.timestamp || serverInfoResp?.timestamp || Date.now()).toLocaleTimeString()}</div>
      </CardContent>
    </Card>
  );
};

export default HomebridgeCard;
