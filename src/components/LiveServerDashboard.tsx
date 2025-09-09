import { useState, useEffect } from 'react';
import { AdGuardCard } from './AdGuardCard';
import { TorCard } from './TorCard';
import { ServerWithService, AdGuardServerStats, TorServerStats } from '../types/server';
import { ServiceFactory } from '../services/ServiceFactory';
import { AdGuardService } from '../services/adguard/AdGuardService';
import { TorService } from '../services/tor/TorService';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Activity, Shield, AlertTriangle, CheckCircle, RefreshCw, Globe } from 'lucide-react';
import { Button } from './ui/button';

export const LiveServerDashboard = () => {
  const [adguardServer, setAdguardServer] = useState<ServerWithService | null>(null);
  const [torServer, setTorServer] = useState<ServerWithService | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAdGuardData = async (): Promise<ServerWithService | null> => {
    const adguardService = ServiceFactory.getService('adguard-main') as AdGuardService;
    if (!adguardService) {
      const error = new Error('AdGuard service not found in factory');
      console.error('❌ AdGuard service not found in factory');
      throw error;
    }

    try {
      const [health, stats] = await Promise.all([
        adguardService.checkHealth(),
        adguardService.getStats()
      ]);
      console.log('✅ AdGuard Home API Response:', { health, stats });

      return {
        id: 'adguard-main',
        name: 'AdGuard Home',
        type: 'network',
        ip: import.meta.env.VITE_DEFAULT_IP,
        port: 5213,
        status: health.status,
        lastSeen: health.lastCheck,
        serviceType: 'adguard',
        description: 'DNS filtering and ad blocking service',
        stats: {
          uptime: 'N/A',
          cpu: 0,
          memory: 0,
          disk: 0,
          network: { incoming: '0 B/s', outgoing: '0 B/s' },
          ...stats,
        } as AdGuardServerStats,
      };
    } catch (error) {
      console.error('❌ Failed to fetch AdGuard Home data:', error);
      // Re-throw the error instead of silently returning fallback data
      throw new Error(`Failed to fetch AdGuard data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const fetchTorData = async (): Promise<ServerWithService | null> => {
    const torService = ServiceFactory.getService('tor-main') as TorService;
    if (!torService) {
      const error = new Error('Tor service not found in factory');
      console.error('❌ Tor service not found in factory');
      throw error;
    }

    try {
      const [health, stats] = await Promise.all([
        torService.checkHealth(),
        torService.getStats()
      ]);
      console.log('✅ Tor Node API Response:', { health, stats });

      return {
        id: 'tor-main',
        name: 'Tor Relay',
        type: 'tor',
        ip: import.meta.env.VITE_DEFAULT_IP,
        port: parseInt(import.meta.env.VITE_TOR_DEFAULT_PORT),
        status: health.status,
        lastSeen: health.lastCheck,
        serviceType: 'tor',
        description: 'Tor relay node',
        stats: {
          uptime: 'N/A',
          cpu: 0,
          memory: 0,
          disk: 0,
          network: { incoming: '0 B/s', outgoing: '0 B/s' },
          ...stats,
        } as TorServerStats,
      };
    } catch (error) {
      console.error('❌ Failed to fetch Tor node data:', error);
      throw new Error(`Failed to fetch Tor data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const loadServerData = async () => {
    setIsRefreshing(true);
    try {
      const [adguardData, torData] = await Promise.allSettled([
        fetchAdGuardData(),
        fetchTorData()
      ]);

      // Handle AdGuard data
      if (adguardData.status === 'fulfilled') {
        setAdguardServer(adguardData.value);
      } else {
        console.error('❌ Failed to load AdGuard data:', adguardData.reason);
        setAdguardServer({
          id: 'adguard-main',
          name: 'AdGuard Home',
          type: 'network',
          ip: import.meta.env.VITE_DEFAULT_IP,
          port: 5213,
          status: 'offline',
          lastSeen: new Date(),
          serviceType: 'adguard',
          description: `DNS filtering service (Error: ${adguardData.reason instanceof Error ? adguardData.reason.message : 'Unknown error'})`,
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
      if (torData.status === 'fulfilled') {
        setTorServer(torData.value);
      } else {
        console.error('❌ Failed to load Tor data:', torData.reason);
        setTorServer({
          id: 'tor-main',
          name: 'Tor Relay',
          type: 'tor',
          ip: import.meta.env.VITE_DEFAULT_IP,
          port: parseInt(import.meta.env.VITE_TOR_DEFAULT_PORT),
          status: 'offline',
          lastSeen: new Date(),
          serviceType: 'tor',
          description: `Tor relay node (Error: ${torData.reason instanceof Error ? torData.reason.message : 'Unknown error'})`,
          stats: {
            uptime: '0s',
            cpu: 0,
            memory: 0,
            disk: 0,
            network: { incoming: '0 B/s', outgoing: '0 B/s' },
            version: 'Unknown',
            nickname: 'Unknown',
            fingerprint: 'Unknown',
            relayType: 'client',
            bandwidth: { observed: 0, burst: 0, average: 0, current: 0 },
            connections: { current: 0, total: 0 },
            circuits: { active: 0, total: 0 },
            flags: [],
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

  const loadAdGuardData = async () => {
    try {
      const adguardData = await fetchAdGuardData();
      setAdguardServer(adguardData);
    } catch (error) {
      console.error('❌ Failed to load AdGuard data:', error);
      setAdguardServer({
        id: 'adguard-main',
        name: 'AdGuard Home',
        type: 'network',
        ip: import.meta.env.VITE_DEFAULT_IP,
        port: 5213,
        status: 'offline',
        lastSeen: new Date(),
        serviceType: 'adguard',
        description: `DNS filtering service (Error: ${error instanceof Error ? error.message : 'Unknown error'})`,
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
  };

  const loadTorData = async () => {
    try {
      const torData = await fetchTorData();
      setTorServer(torData);
    } catch (error) {
      console.error('❌ Failed to load Tor data:', error);
      setTorServer({
        id: 'tor-main',
        name: 'Tor Relay',
        type: 'tor',
        ip: import.meta.env.VITE_DEFAULT_IP,
        port: parseInt(import.meta.env.VITE_TOR_DEFAULT_PORT),
        status: 'offline',
        lastSeen: new Date(),
        serviceType: 'tor',
        description: `Tor relay node (Error: ${error instanceof Error ? error.message : 'Unknown error'})`,
        stats: {
          uptime: '0s',
          cpu: 0,
          memory: 0,
          disk: 0,
          network: { incoming: '0 B/s', outgoing: '0 B/s' },
          nickname: 'torrelaytor',
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
  };

  useEffect(() => {
    // Initial load for both services
    const loadInitialData = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          loadAdGuardData(),
          loadTorData()
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();

    // Set up separate intervals for each service
    // AdGuard Home: update every 15 seconds (15000ms)
    const adguardInterval = setInterval(() => {
      console.log('🔄 AdGuard automatic update (15s interval)');
      loadAdGuardData();
    }, 15000);
    
    // Tor: update every 5 minutes (300000ms)
    const torInterval = setInterval(() => {
      console.log('🔄 Tor automatic update (5min interval)');
      loadTorData();
    }, 300000);

    // Cleanup intervals on unmount
    return () => {
      console.log('🧹 Cleaning up update intervals');
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