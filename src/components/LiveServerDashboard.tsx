import { useState, useEffect } from 'react';
import { AdGuardCard } from './AdGuardCard';
import { TorCard } from './TorCard';
import { ServerWithService, AdGuardServerStats, TorServerStats } from '../types/server';
import { apiClient } from '../services/ApiClient';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Activity, Shield, AlertTriangle, CheckCircle, RefreshCw, Globe } from 'lucide-react';
import { Button } from './ui/button';

export const LiveServerDashboard = () => {
  const [adguardServer, setAdguardServer] = useState<ServerWithService | null>(null);
  const [torServer, setTorServer] = useState<ServerWithService | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAdGuardData = async (): Promise<ServerWithService> => {
    try {
      const [status, stats] = await Promise.all([
        apiClient.getAdGuardStatus(),
        apiClient.getAdGuardStats()
      ]);

      return {
        id: 'adguard-main',
        name: 'AdGuard Home',
        type: 'network',
        ip: import.meta.env.VITE_BACKEND_URL?.replace(/https?:\/\//, '').split(':')[0] || 'backend',
        port: stats.http_port || 3000,
        status: status.running ? 'online' : 'offline',
        lastSeen: new Date(),
        serviceType: 'adguard',
        description: 'DNS filtering and ad blocking service',
        stats: {
          uptime: 'N/A',
          cpu: 0,
          memory: 0,
          disk: 0,
          network: { incoming: '0 B/s', outgoing: '0 B/s' },
          totalQueries: stats.num_dns_queries,
          blockedQueries: stats.num_blocked_filtering,
          allowedQueries: stats.num_dns_queries - stats.num_blocked_filtering,
          blockingRate: stats.num_dns_queries > 0 ? (stats.num_blocked_filtering / stats.num_dns_queries) * 100 : 0,
          protectionEnabled: stats.protection_enabled,
          version: stats.version,
          topBlockedDomain: 'N/A',
          topQueriedDomain: 'N/A',
          avgProcessingTime: stats.avg_processing_time,
          running: stats.running,
        } as AdGuardServerStats,
      };
    } catch (error) {
      throw new Error(`Failed to fetch AdGuard data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const fetchTorData = async (): Promise<ServerWithService> => {
    try {
      const relay = await apiClient.getTorRelay();

      return {
        id: 'tor-main',
        name: 'Tor Relay',
        type: 'tor',
        ip: import.meta.env.VITE_BACKEND_URL?.replace(/https?:\/\//, '').split(':')[0] || 'backend',
        port: relay.or_addresses?.[0]?.split(':')[1] ? parseInt(relay.or_addresses[0].split(':')[1]) : 9001,
        status: relay.running ? 'online' : 'offline',
        lastSeen: new Date(),
        serviceType: 'tor',
        description: 'Tor relay node',
        stats: {
          uptime: 'N/A',
          cpu: 0,
          memory: 0,
          disk: 0,
          network: { incoming: '0 B/s', outgoing: '0 B/s' },
          nickname: relay.nickname,
          fingerprint: relay.fingerprint,
          flags: relay.flags,
          relayType: relay.flags?.includes('Exit') ? 'exit' : relay.flags?.includes('Guard') ? 'guard' : 'relay',
          bandwidth: {
            current: relay.observed_bandwidth || 0,
            average: relay.observed_bandwidth || 0,
            burst: relay.bandwidth_burst || 0
          },
          connections: { current: 0, total: 0 },
          circuits: { active: 0, total: 0 },
          country: relay.country_name || relay.country,
          city: relay.city_name,
          running: relay.running,
          hibernating: relay.hibernating || false,
          version: relay.version,
          platform: relay.platform,
          contact: relay.contact,
          consensusWeight: relay.consensus_weight,
          orPort: relay.or_addresses?.[0]?.split(':')[1] ? parseInt(relay.or_addresses[0].split(':')[1]) : undefined,
        } as TorServerStats,
      };
    } catch (error) {
      throw new Error(`Failed to fetch Tor data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const loadServerData = async () => {
    setIsRefreshing(true);
    try {
      const [adguardResult, torResult] = await Promise.allSettled([
        fetchAdGuardData(),
        fetchTorData()
      ]);

      // Handle AdGuard data
      if (adguardResult.status === 'fulfilled') {
        setAdguardServer(adguardResult.value);
      } else {
        setAdguardServer({
          id: 'adguard-main',
          name: 'AdGuard Home',
          type: 'network',
          ip: 'backend',
          port: 3000,
          status: 'offline',
          lastSeen: new Date(),
          serviceType: 'adguard',
          description: `DNS filtering service (Error: ${adguardResult.reason instanceof Error ? adguardResult.reason.message : 'Unknown error'})`,
          stats: {
            uptime: '0s',
            cpu: 0,
            memory: 0,
            disk: 0,
            network: { incoming: '0 B/s', outgoing: '0 B/s' },
            totalQueries: 0,
            blockedQueries: 0,
            allowedQueries: 0,
            blockingRate: 0,
            protectionEnabled: false,
            version: 'Unknown',
            topBlockedDomain: 'N/A',
            topQueriedDomain: 'N/A',
            avgProcessingTime: 0,
            running: false,
          } as AdGuardServerStats,
        });
      }

      // Handle Tor data
      if (torResult.status === 'fulfilled') {
        setTorServer(torResult.value);
      } else {
        setTorServer({
          id: 'tor-main',
          name: 'Tor Relay',
          type: 'tor',
          ip: 'backend',
          port: 9001,
          status: 'offline',
          lastSeen: new Date(),
          serviceType: 'tor',
          description: `Tor relay node (Error: ${torResult.reason instanceof Error ? torResult.reason.message : 'Unknown error'})`,
          stats: {
            uptime: '0s',
            cpu: 0,
            memory: 0,
            disk: 0,
            network: { incoming: '0 B/s', outgoing: '0 B/s' },
            nickname: 'Unknown',
            fingerprint: 'Unknown',
            flags: [],
            relayType: 'relay',
            bandwidth: { current: 0, average: 0, burst: 0 },
            connections: { current: 0, total: 0 },
            circuits: { active: 0, total: 0 },
            country: 'Unknown',
            running: false,
            hibernating: false,
          } as TorServerStats,
        });
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadServerData();

    // Set up intervals for automatic updates
    const adguardInterval = setInterval(() => {
      loadServerData();
    }, 15000);
    
    const torInterval = setInterval(() => {
      loadServerData();
    }, 300000);

    return () => {
      clearInterval(adguardInterval);
      clearInterval(torInterval);
    };
  }, []);

  const adguardStats = adguardServer?.stats as AdGuardServerStats | undefined;
  const torStats = torServer?.stats as TorServerStats | undefined;
  const totalQueries = adguardStats?.totalQueries ?? 0;
  const totalBlocked = adguardStats?.blockedQueries ?? 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Live Dashboard</h2>
        <Button onClick={loadServerData} disabled={isRefreshing} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AdGuard Status</CardTitle>
            {adguardServer?.status === 'online' ? <CheckCircle className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-yellow-500" />}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold capitalize ${adguardServer?.status === 'online' ? 'text-green-600' : 'text-yellow-600'}`}>
              {adguardServer?.status || 'Unknown'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tor Status</CardTitle>
            {torServer?.status === 'online' ? <Globe className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-yellow-500" />}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold capitalize ${torServer?.status === 'online' ? 'text-green-600' : 'text-yellow-600'}`}>
              {torServer?.status || 'Unknown'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Queries (24h)</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(totalQueries / 1000).toFixed(1)}K</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Block Rate</CardTitle>
            <Shield className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalQueries > 0 ? ((totalBlocked / totalQueries) * 100).toFixed(1) : 0}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Service Tiles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {adguardServer && (
          <AdGuardCard
            name={adguardServer.name}
            status={adguardServer.status}
            stats={adguardStats!}
            ip={adguardServer.ip}
            port={adguardServer.port}
            lastSeen={adguardServer.lastSeen}
          />
        )}
        {torServer && (
          <TorCard
            name={torServer.name}
            status={torServer.status}
            stats={torStats!}
            ip={torServer.ip}
            port={torServer.port}
            lastSeen={torServer.lastSeen}
          />
        )}
      </div>
    </div>
  );
};