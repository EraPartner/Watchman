import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ServerStatusBadge } from './ServerStatusBadge';
import { apiClient } from '../services/ApiClient';
import { Server, Cloud, Link as LinkIcon, Users, Database, Map as MapIcon } from 'lucide-react';
import ServiceLink from '@/components/ServiceLink';

export const IpfsCard: React.FC<{ name?: string }> = ({ name = 'IPFS' }) => {
  const [status, setStatus] = useState<'online' | 'offline' | 'warning' | 'loading'>('loading');
  const [stats, setStats] = useState<any | null>(null);
  const [frontendCfg, setFrontendCfg] = useState<any | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      try {
        const health = await apiClient.getIpfsStatus();
        if (!mounted) return;
        const mapped = (health.status === 'not_configured') ? 'offline' : (health.status as any);
        setStatus(mapped);
        if (health.status === 'online' || health.status === 'warning') {
          const s = await apiClient.getIpfsStats();
          if (!mounted) return;
          setStats(s);
        } else {
          setStats(null);
        }
      } catch (err) {
        if (!mounted) return;
        setStatus('offline');
        setStats(null);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await apiClient.getFrontendConfig();
        if (mounted) setFrontendCfg(cfg.services?.ipfs || null);
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  const buildLink = () => {
    const webUrl = frontendCfg?.webUrl || null;
    if (webUrl) return <ServiceLink raw={webUrl} preferHttps={true} title="Open IPFS Web UI" compact hostOnly />;

    const host = frontendCfg?.host || null;
    const port = frontendCfg?.port || null;
    if (host) {
      const raw = `${host}${port ? `:${port}` : ''}`;
      return <ServiceLink raw={raw} preferHttps={false} title="Open IPFS node" compact hostOnly />;
    }

    return 'Unknown';
  };

  // helpers
  const formatBytes = (bytes: number | null | undefined) => {
    if (bytes === null || bytes === undefined) return 'N/A';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B','KB','MB','GB','TB'];
    const i = Math.floor(Math.log(Math.max(bytes,1)) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatRate = (bytesPerSec: number | null | undefined) => {
    if (bytesPerSec === null || bytesPerSec === undefined) return 'N/A';
    return `${formatBytes(bytesPerSec)}/s`;
  };

  const addressesCount = stats && Array.isArray(stats.addresses) ? stats.addresses.length : (stats && typeof stats.addresses === 'number' ? stats.addresses : null);
  const peersCount = stats && typeof stats.peers === 'number' ? stats.peers : (stats && stats.peers ? Number(stats.peers) : 0);
  const repoSize = stats && stats.repo ? (stats.repo.repoSize || stats.repo.RepoSize || stats.repo.repoSizeBytes || null) : null;
  const bwIn = stats && stats.bw ? (stats.bw.totalIn || stats.bw.TotalIn || 0) : null;
  const bwOut = stats && stats.bw ? (stats.bw.totalOut || stats.bw.TotalOut || 0) : null;
  const rateIn = stats && stats.bw ? (stats.bw.rateIn || stats.bw.RateIn || stats.bw.rateInBytes || 0) : null;
  const rateOut = stats && stats.bw ? (stats.bw.rateOut || stats.bw.RateOut || 0) : null;

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Cloud className="h-4 w-4" /> {name}
        </CardTitle>
        <ServerStatusBadge status={status} />
      </CardHeader>

      {stats && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Server className="h-3 w-3" /> Version
              </div>
              <div className="font-mono font-semibold text-sm">{stats.version || stats.Version || 'Unknown'}</div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <LinkIcon className="h-3 w-3" /> Node
              </div>
              <div className="font-medium text-xs">{buildLink()}</div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <MapIcon className="h-3 w-3" /> Addresses
              </div>
              <div className="font-mono font-semibold text-sm">{addressesCount !== null ? addressesCount : 'Unknown'}</div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Users className="h-3 w-3" /> Peers
              </div>
              <div className="font-mono font-semibold text-sm">{peersCount}</div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Database className="h-3 w-3" /> Repo Size
              </div>
              <div className="font-mono font-semibold text-sm">{repoSize ? formatBytes(Number(repoSize)) : 'N/A'}</div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Server className="h-3 w-3" /> Bandwidth
              </div>
              <div className="font-mono font-semibold text-sm">In: {bwIn !== null ? formatBytes(Number(bwIn)) : 'N/A'} / Out: {bwOut !== null ? formatBytes(Number(bwOut)) : 'N/A'}</div>
            </div>

            <div className="col-span-2 border-t pt-3">
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">Realtime rates</div>
              <div className="font-mono font-semibold text-sm">In: {rateIn !== null ? formatRate(Number(rateIn)) : 'N/A'} · Out: {rateOut !== null ? formatRate(Number(rateOut)) : 'N/A'}</div>
            </div>
          </div>
        </CardContent>
      )}

    </Card>
  );
};

// named export only