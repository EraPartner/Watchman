import { useState, useEffect, useCallback } from 'react';
import { AdGuardCard } from './AdGuardCard';
import { TorCard } from './TorCard';
import { ServerWithService, AdGuardServerStats, TorServerStats } from '../types/server';
import { apiClient } from '../services/ApiClient';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Activity, Shield, CheckCircle, RefreshCw, Server } from 'lucide-react';
import { Button } from './ui/button';
import { APP_CONFIG } from '../lib/constants';
import { BitcoinCard } from './BitcoinCard';

export const LiveServerDashboard = () => {
  const [adguardServer, setAdguardServer] = useState<ServerWithService | null>(null);
  const [torServer, setTorServer] = useState<ServerWithService | null>(null);
  const [bitcoinStatus, setBitcoinStatus] = useState<'online' | 'offline' | 'warning' | 'loading'>('loading');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());

  const fetchAdGuardData = useCallback(async (): Promise<ServerWithService> => {
    try {
      const [health, stats] = await Promise.all([
        apiClient.getAdGuardStatus(),
        apiClient.getAdGuardStats()
      ]);

      return {
        id: 'adguard-main',
        name: 'AdGuard Home',
        type: 'network',
        ip: import.meta.env.VITE_BACKEND_URL?.replace(/https?:\/\//, '').split(':')[0] || 'backend',
        port: stats.httpPort || 3000,
        status: health.status === 'online' ? 'online' : health.status === 'warning' ? 'warning' : 'offline',
        lastSeen: new Date(),
        serviceType: 'adguard',
        description: 'DNS filtering and ad blocking service',
        stats: {
          uptime: 'N/A',
          cpu: 0,
          memory: 0,
          disk: 0,
          network: { incoming: '0 B/s', outgoing: '0 B/s' },
          totalQueries: stats.totalQueries || 0,
          blockedQueries: stats.blockedQueries || 0,
          allowedQueries: stats.allowedQueries || 0,
          blockingRate: stats.blockingRate || 0,
          protectionEnabled: stats.protectionEnabled || false,
          version: stats.version || 'Unknown',
          topBlockedDomain: stats.topBlockedDomain || 'N/A',
          topQueriedDomain: stats.topQueriedDomain || 'N/A',
          avgProcessingTime: stats.avgProcessingTime || 0,
          running: stats.running || false,
        } as AdGuardServerStats,
      };
    } catch (error) {
      console.error('❌ LiveServerDashboard - AdGuard fetch failed:', error);
      throw new Error(`Failed to fetch AdGuard data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, []);

  const fetchTorData = useCallback(async (): Promise<ServerWithService> => {
    try {
      const [torStats, frontendConfig] = await Promise.all([
        apiClient.getTorRelay(),
        apiClient.getFrontendConfig()
      ]);

      const torConfig = frontendConfig?.services?.tor || {};

      return {
        id: 'tor-main',
        name: 'Tor Relay',
        type: 'tor',
        ip: torConfig.ip || 'backend',
        port: torConfig.port || torStats.orPort || 9001,
        status: torStats.running ? 'online' : 'offline',
        lastSeen: new Date(),
        serviceType: 'tor',
        description: 'Tor relay node',
        stats: {
          uptime: 'N/A',
          cpu: 0,
          memory: 0,
          disk: 0,
          network: { incoming: '0 B/s', outgoing: '0 B/s' },
          nickname: torStats.nickname || 'Unknown',
          fingerprint: torStats.fingerprint || 'Unknown',
          flags: torStats.flags || [],
          relayType: torStats.relayType || 'relay',
          bandwidth: torStats.bandwidth || { current: 0, average: 0, burst: 0 },
          connections: { current: 0, total: 0 },
          circuits: { active: 0, total: 0 },
          country: torStats.country || 'Unknown',
          city: torStats.city,
          running: torStats.running || false,
          hibernating: torStats.hibernating || false,
          version: torStats.version,
          platform: torStats.platform,
          contact: torStats.contact,
          consensusWeight: torStats.consensus_weight,
          orPort: torStats.orPort,
        } as TorServerStats,
      };
    } catch (error) {
      console.error('❌ LiveServerDashboard - Tor fetch failed:', error);
      throw new Error(`Failed to fetch Tor data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, []);

  // Fetch Bitcoin status
  const fetchBitcoinStatus = useCallback(async () => {
    try {
      const health = await apiClient.getBitcoinStatus();
      setBitcoinStatus(health.status as 'online' | 'offline' | 'warning' | 'loading');
    } catch (error) {
      console.error('❌ LiveServerDashboard - Bitcoin fetch failed:', error);
      setBitcoinStatus('offline');
    }
  }, []);

  const loadServerData = useCallback(async () => {
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
            bandwidth: { current: 0, average: 0, burst: 0, observed: 0 },
            connections: { current: 0, total: 0 },
            circuits: { active: 0, total: 0 },
            country: 'Unknown',
            running: false,
            hibernating: false,
            version: 'Unknown',
          } as TorServerStats,
        });
      }

      // Fetch Bitcoin status
      await fetchBitcoinStatus();
      
      setLastUpdateTime(new Date());
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [fetchAdGuardData, fetchTorData, fetchBitcoinStatus]);

  useEffect(() => {
    loadServerData();

    // Set up intervals for automatic updates using constants
    const adguardInterval = setInterval(() => {
      loadServerData();
    }, APP_CONFIG.ADGUARD_REFRESH_INTERVAL);
    
    const torInterval = setInterval(() => {
      loadServerData();
    }, APP_CONFIG.TOR_REFRESH_INTERVAL);

    return () => {
      clearInterval(adguardInterval);
      clearInterval(torInterval);
    };
  }, [loadServerData]);

  // Calculate service counts
  const allServices = [adguardServer, torServer, { status: bitcoinStatus }];
  const onlineCount = allServices.filter(service => service?.status === 'online').length;
  const offlineCount = allServices.filter(service => service?.status === 'offline').length;
  const warningCount = allServices.filter(service => service?.status === 'warning').length;
  const totalServices = allServices.length;

  const adguardStats = adguardServer?.stats as AdGuardServerStats | undefined;
  const torStats = torServer?.stats as TorServerStats | undefined;
  const totalQueries = adguardStats?.totalQueries ?? 0;
  const totalBlocked = adguardStats?.blockedQueries ?? 0;
  
  // Get top blocked domain for interesting info
  const topBlockedDomain = adguardStats?.topBlockedDomain !== 'N/A' ? adguardStats?.topBlockedDomain : 'None';
  
  // Calculate time since last update for system info
  const timeSinceUpdate = Math.floor((Date.now() - lastUpdateTime.getTime()) / 1000);

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
              {topBlockedDomain || 'None'}
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {adguardServer && (
          <AdGuardCard
            name={adguardServer.name}
            status={adguardServer.status}
            stats={adguardStats!}
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
        <BitcoinCard />
      </div>
    </div>
  );
};