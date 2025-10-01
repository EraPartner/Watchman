import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdGuardCard } from './AdGuardCard';
import { TorCard } from './TorCard';
import { AdGuardServerStats, TorServerStats } from '../types/server';
import { apiClient } from '../services/ApiClient';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Activity, Shield, CheckCircle, RefreshCw, Server } from 'lucide-react';
import { Button } from './ui/button';
import { APP_CONFIG } from '../lib/constants';
import { BitcoinCard } from './BitcoinCard';
import { QBittorrentCard } from './QBittorrentCard';
import { IpfsCard } from './IpfsCard';
import SynologyCard from './SynologyCard';
import RoonCard from './RoonCard';
import PhilipsBridgeCard from './PhilipsBridgeCard';
import AlbyHubCard from './AlbyHubCard';
import { MacMiniCard } from './MacMiniCard';
import { NostrcheckCard } from './NostrcheckCard';
import RouterCard from './RouterCard';
import HomebridgeCard from './HomebridgeCard';

export const LiveServerDashboard = () => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // AdGuard combined status + stats
  const adguardQuery = useQuery({
    queryKey: ['adguard','full'],
    queryFn: async () => {
      const [health, stats] = await Promise.all([apiClient.getAdGuardStatus(), apiClient.getAdGuardStats()]);
      return { health, stats };
    },
    refetchInterval: APP_CONFIG.ADGUARD_REFRESH_INTERVAL,
    retry: 1,
  });

  const torQuery = useQuery({
    queryKey: ['tor','relay'],
    queryFn: async () => {
      const [torStats, frontendConfig] = await Promise.all([apiClient.getTorRelay(), apiClient.getFrontendConfig()]);
      return { torStats, frontendConfig };
    },
    refetchInterval: APP_CONFIG.TOR_REFRESH_INTERVAL,
    retry: 1,
  });

  const bitcoinQuery = useQuery({
    queryKey: ['bitcoin','status'],
    queryFn: () => apiClient.getBitcoinStatus(),
    refetchInterval: 30000,
    retry: 1,
  });

  const qbittorrentQuery = useQuery({
    queryKey: ['qbittorrent','status'],
    queryFn: () => apiClient.getQBittorrentStatus(),
    refetchInterval: 30000,
    retry: 1,
  });

  const ipfsQuery = useQuery({
    queryKey: ['ipfs','status'],
    queryFn: () => apiClient.getIpfsStatus(),
    refetchInterval: 30000,
    retry: 1,
  });

  const synologyQuery = useQuery({
    queryKey: ['synology','status'],
    queryFn: () => apiClient.getSynologyStatus(),
    refetchInterval: 60000,
    retry: 1,
  });

  const roonQuery = useQuery({
    queryKey: ['roon','status'],
    queryFn: () => apiClient.getRoonStatus(),
    refetchInterval: APP_CONFIG.ADGUARD_REFRESH_INTERVAL,
    retry: 1,
  });

  // Global services health summary (returns health for all registered services)
  const servicesHealthQuery = useQuery({
    queryKey: ['services','health'],
    queryFn: () => apiClient.getServicesHealth(),
    refetchInterval: 30000,
    retry: 1,
  });

  const lastUpdateTime = new Date();

  // derive adguard/tor/other statuses from queries
  const adguardData = adguardQuery.data;
  const torData = torQuery.data;
  const bitcoinHealth = bitcoinQuery.data;
  const qbittorrentHealth = qbittorrentQuery.data;
  const ipfsHealth = ipfsQuery.data;
  const synologyHealth = synologyQuery.data;
  const roonHealth = roonQuery.data;

  // We'll derive the total and counts dynamically from the services health endpoint when available.
  // Fallback to local tile counts if the endpoint is not available yet.
 
  // helper to map API service status strings to ServerStatus used by cards
  const mapServiceStatus = (s?: string) => {
    switch (s) {
      case 'online':
        return 'online' as const;
      case 'warning':
        return 'warning' as const;
      case 'not_configured':
        return 'offline' as const;
      case 'offline':
        return 'offline' as const;
      default:
        return 'offline' as const;
    }
  };

  // Build a fallback normalized status list from the queries we already run in this component
  const fallbackNormalizedStatuses = [
    adguardData?.health?.status || 'loading',
    torData?.torStats?.running ? 'online' : (torData ? 'offline' : 'loading'),
    (bitcoinHealth?.status) || 'loading',
    (qbittorrentHealth?.status) || 'loading',
    (ipfsHealth?.status) || 'loading',
    (synologyHealth?.status) || 'loading',
    (roonHealth?.status === 'error' ? 'warning' : roonHealth?.status) || 'loading'
  ] as Array<'online'|'offline'|'warning'|'loading'>;

  // If we have a services health response, we'll derive counts from it later.
  // For now declare placeholders; real values will be calculated after tiles are composed
  let totalServices: number | undefined;
  let onlineCount: number;
  let offlineCount: number;
  let warningCount: number;

  if (servicesHealthQuery.data && servicesHealthQuery.data.services) {
    const svcObj = servicesHealthQuery.data.services as Record<string, any>;
    const statuses = Object.values(svcObj).map((s: any) => {
      // Normalize backend status strings (map 'error' -> 'warning', 'not_configured' -> 'offline')
      const st = s && s.status ? String(s.status) : 'offline';
      if (st === 'error') return 'warning';
      if (st === 'not_configured') return 'offline';
      return st as 'online' | 'offline' | 'warning';
    });

    totalServices = statuses.length;
    onlineCount = statuses.filter(s => s === 'online').length;
    offlineCount = statuses.filter(s => s === 'offline').length;
    warningCount = statuses.filter(s => s === 'warning').length;
  } else {
    // fallback: compute total based on known tiles
    // softwareTiles/hardwareTiles are created further down; estimate from them if available later
    totalServices = fallbackNormalizedStatuses.length; // fallback to number of queries we run
    onlineCount = fallbackNormalizedStatuses.filter(s => s === 'online').length;
    offlineCount = fallbackNormalizedStatuses.filter(s => s === 'offline').length;
    warningCount = fallbackNormalizedStatuses.filter(s => s === 'warning').length;
  }

  const adguardStats = adguardData?.stats as any as AdGuardServerStats | undefined;
  const totalQueries = adguardStats?.totalQueries ?? 0;
  const totalBlocked = adguardStats?.blockedQueries ?? 0;

  // Build card-ready AdGuard stats (map API shape to component shape)
  const adguardCardStats: AdGuardServerStats | undefined = adguardData?.stats ? {
    totalQueries: adguardData.stats.totalQueries ?? 0,
    blockedQueries: adguardData.stats.blockedQueries ?? 0,
    allowedQueries: adguardData.stats.allowedQueries ?? 0,
    blockingRate: adguardData.stats.blockingRate ?? 0,
    protectionEnabled: adguardData.stats.protectionEnabled ?? false,
    version: adguardData.stats.version ?? 'Unknown',
    topBlockedDomain: adguardData.stats.topBlockedDomain ?? 'N/A',
    topQueriedDomain: adguardData.stats.topQueriedDomain ?? 'N/A',
    avgProcessingTime: adguardData.stats.avgProcessingTime ?? 0,
    running: adguardData.stats.running ?? false,
    timeUnits: adguardData.stats.timeUnits,
    topClient: adguardData.stats.topClient ?? 'N/A',
    safebrowsingBlocked: adguardData.stats.safebrowsingBlocked ?? 0,
    safesearchBlocked: adguardData.stats.safesearchBlocked ?? 0,
    parentalBlocked: adguardData.stats.parentalBlocked ?? 0,
  } : undefined;

  // Build card-ready Tor stats (map API shape to component shape)
  const torRaw = torData?.torStats as any | undefined;
  const frontendCfg = torData?.frontendConfig as any | undefined;
  const torCardStats: TorServerStats | undefined = torRaw ? {
    version: torRaw.version ?? 'Unknown',
    nickname: torRaw.nickname ?? undefined,
    fingerprint: torRaw.fingerprint ?? 'Unknown',
    relayType: (torRaw.relayType || 'relay') as TorServerStats['relayType'],
    bandwidth: {
      current: (torRaw.bandwidth && torRaw.bandwidth.current) ?? 0,
      average: (torRaw.bandwidth && torRaw.bandwidth.average) ?? 0,
      burst: (torRaw.bandwidth && torRaw.bandwidth.burst) ?? 0,
      observed: (torRaw.bandwidth && torRaw.bandwidth.observed) ?? undefined,
    },
    connections: { current: (torRaw.connections && torRaw.connections.current) ?? 0, total: (torRaw.connections && torRaw.connections.total) ?? 0 },
    circuits: { active: (torRaw.circuits && torRaw.circuits.active) ?? 0, total: (torRaw.circuits && torRaw.circuits.total) ?? 0 },
    flags: torRaw.flags ?? [],
    consensusWeight: torRaw.consensus_weight ?? undefined,
    exitPolicy: torRaw.exit_policy ?? undefined,
    hibernating: torRaw.hibernating ?? false,
    orPort: torRaw.orPort ?? torRaw.or_port ?? undefined,
    controlPort: torRaw.controlPort ?? undefined,
    running: !!torRaw.running,
    country: torRaw.country ?? undefined,
    city: torRaw.city ?? undefined,
    platform: torRaw.platform ?? undefined,
    contact: torRaw.contact ?? undefined,
  } : undefined;

  const timeSinceUpdate = Math.floor((Date.now() - lastUpdateTime.getTime()) / 1000);

  // Refresh helper - refetch all queries
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      adguardQuery.refetch(),
      torQuery.refetch(),
      bitcoinQuery.refetch(),
      qbittorrentQuery.refetch(),
      ipfsQuery.refetch(),
      synologyQuery.refetch(),
      roonQuery.refetch(),
    ]);
    setIsRefreshing(false);
  };

  // loading indicator when initial queries are loading
  if (adguardQuery.isLoading && torQuery.isLoading && bitcoinQuery.isLoading && qbittorrentQuery.isLoading && ipfsQuery.isLoading && synologyQuery.isLoading && roonQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Precompute Tor IP and Port values for rendering
  const torIp: string | undefined = frontendCfg?.services?.tor?.ip ?? undefined;
  const torPortValue: number | undefined = frontendCfg?.services?.tor?.port ?? torCardStats?.orPort ?? undefined;

  // Helper: chunk an array into fixed-size rows
  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  };

  // Build arrays of tile elements so we can chunk and render rows exactly 3 per row
  const softwareTiles: JSX.Element[] = [];
  if (adguardData && adguardCardStats) {
    softwareTiles.push(
      <AdGuardCard
        key="adguard"
        name={'AdGuard Home'}
        status={mapServiceStatus(adguardData.health.status)}
        stats={adguardCardStats}
      />
    );
  }
  if (torData && torCardStats) {
    softwareTiles.push(
      <TorCard
        key="tor"
        name={torCardStats.nickname || 'Tor Relay'}
        status={torCardStats.running ? 'online' : 'offline'}
        stats={torCardStats}
        ip={torIp}
        port={torPortValue}
      />
    );
  }
  // Other software tiles
  softwareTiles.push(<BitcoinCard key="bitcoin" />);
  softwareTiles.push(<QBittorrentCard key="qbittorrent" />);
  // Stack IPFS and Homebridge vertically so they occupy the same column similar to Nostr/Alby
  softwareTiles.push(
    <div key="ipfs-homebridge-stacked" className="h-full flex flex-col gap-4">
      <div className="flex-1 min-h-0">
        <IpfsCard />
      </div>
      <div className="flex-1 min-h-0">
        <HomebridgeCard />
      </div>
    </div>
  );

  // Nostrcheck / local Nostr relay tile - use the frontend config exposed by the backend
  const nostrCfg = frontendCfg?.services?.nostrcheck as any | undefined;
  const nostrStatus = nostrCfg && nostrCfg.configured ? 'online' as const : 'offline' as const;

  // Stack Nostrcheck and AlbyHub vertically so the combined tile matches other card heights
  softwareTiles.push(
    <div key="nostr-alby-stacked" className="h-full flex flex-col gap-4">
      <div className="flex-1 min-h-0">
        <NostrcheckCard name={'Nostr Relay'} status={nostrStatus} url={nostrCfg?.relayUrl} />
       </div>
       <div className="flex-1 min-h-0">
        <AlbyHubCard />
       </div>
     </div>
   );

  const hardwareTiles: JSX.Element[] = [
    <SynologyCard key="synology" />,
    <RoonCard key="roon" />,
    <PhilipsBridgeCard key="philips" />,
    <MacMiniCard key="macmini" />,
    // Router hardware tiles: Beryl and Telenet (if configured in backend services/health)
    <RouterCard key="beryl" name={'Beryl AX'} serviceKey={'beryl'} />,
    <RouterCard key="telenet" name={'Telenet'} serviceKey={'telenet'} />,
  ];

  const softwareRows = chunk(softwareTiles, 3);
  const hardwareRows = chunk(hardwareTiles, 3);

  // Compute overview counts: prefer the backend services health endpoint. If not available,
  // fall back to the actual tiles we render so the total matches visible tiles.
  if (servicesHealthQuery.data && servicesHealthQuery.data.services) {
    const svcObj = servicesHealthQuery.data.services as Record<string, any>;
    const statuses = Object.values(svcObj).map((s: any) => {
      const st = s && s.status ? String(s.status) : 'offline';
      if (st === 'error') return 'warning';
      if (st === 'not_configured') return 'offline';
      return st as 'online' | 'offline' | 'warning';
    });

    totalServices = statuses.length;
    onlineCount = statuses.filter(s => s === 'online').length;
    offlineCount = statuses.filter(s => s === 'offline').length;
    warningCount = statuses.filter(s => s === 'warning').length;
  } else {
    // fallback: derive totals from the tiles we actually render
    totalServices = softwareTiles.length + hardwareTiles.length;
    // If tiles are empty (very early load), use fallbackNormalizedStatuses for counts
    if (totalServices === 0) {
      totalServices = fallbackNormalizedStatuses.length;
      onlineCount = fallbackNormalizedStatuses.filter(s => s === 'online').length;
      offlineCount = fallbackNormalizedStatuses.filter(s => s === 'offline').length;
      warningCount = fallbackNormalizedStatuses.filter(s => s === 'warning').length;
    } else {
      // Count online/warning/offline by inspecting respective card props where available
      // We can attempt to derive from earlier normalized statuses for the first N tiles
      const combinedStatuses = fallbackNormalizedStatuses.slice(0, totalServices);
      onlineCount = combinedStatuses.filter(s => s === 'online').length;
      offlineCount = combinedStatuses.filter(s => s === 'offline').length;
      warningCount = combinedStatuses.filter(s => s === 'warning').length;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Live Dashboard</h2>
        <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Services Online</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {onlineCount}/{totalServices}
            </div>
            <p className="text-xs text-muted-foreground">
              {offlineCount > 0 && `${offlineCount} offline`}
              {warningCount > 0 && `${offlineCount > 0 ? ', ' : ''}${warningCount} warning`}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <Server className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {onlineCount === totalServices ? 'Excellent' : 
               onlineCount >= totalServices * 0.7 ? 'Good' : 
               onlineCount > 0 ? 'Degraded' : 'Critical'}
            </div>
            <p className="text-xs text-muted-foreground">
              Updated {timeSinceUpdate}s ago
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Blocked Domain</CardTitle>
            <Shield className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-red-600 truncate">
              {adguardStats?.topBlockedDomain !== 'N/A' ? adguardStats?.topBlockedDomain : 'None'}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalBlocked.toLocaleString()} blocked today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Network Activity</CardTitle>
            <Activity className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {totalQueries > 0 ? `${(totalQueries / 1000).toFixed(1)}K` : '0'}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalQueries > 0 ? `${((totalBlocked / totalQueries) * 100).toFixed(1)}% blocked` : 'No queries'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Service Tiles */}
      {/* Software Section: core software services */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Software</h3>
        </div>
        <div className="mt-3 space-y-4">
          {softwareRows.map((row, idx) => (
            <div
              key={`software-row-${idx}`}
              className={`flex flex-col sm:flex-row gap-6 items-stretch ${row.length < 3 ? 'justify-center' : ''}`}
            >
              {row.map((tile, i) => (
                <div key={`software-${idx}-${i}`} className="flex-1 min-w-0">
                  {tile}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Hardware Section: physical devices and appliances */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Hardware</h3>
        </div>
        <div className="mt-3 space-y-4">
          {hardwareRows.map((row, idx) => (
            <div
              key={`hardware-row-${idx}`}
              className={`flex flex-col sm:flex-row gap-6 items-stretch ${row.length < 3 ? 'justify-center' : ''}`}
            >
              {row.map((tile, i) => (
                <div key={`hardware-${idx}-${i}`} className="flex-1 min-w-0">
                  {tile}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};