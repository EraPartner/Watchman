import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ServerStatusBadge } from './ServerStatusBadge';
import { QBittorrentStats } from '../types/api';
import { apiClient } from '../services/ApiClient';
import { ExternalLink } from 'lucide-react';

// qBittorrent logo SVG component
const QBittorrentIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"
      fill="#2f5bea"
    />
    <path
      d="M8 8h8v8H8z"
      fill="#2f5bea"
    />
    <path
      d="M10 10h4v4h-4z"
      fill="white"
    />
  </svg>
);

export const QBittorrentCard: React.FC = () => {
  const [status, setStatus] = useState<'online' | 'offline' | 'warning' | 'loading'>('loading');
  const [stats, setStats] = useState<QBittorrentStats | null>(null);
  const [frontendConfig, setFrontendConfig] = useState<any | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      try {
        const health = await apiClient.getQBittorrentStatus();
        
        if (!mounted) return;
        
        // Handle the not_configured status by treating it as offline
        const mappedStatus = health.status === 'not_configured' ? 'offline' : health.status;
        setStatus(mappedStatus as 'online' | 'offline' | 'warning' | 'loading');
        
        if (health.status === 'online' || health.status === 'warning') {
          const qbtStats = await apiClient.getQBittorrentStats();
          
          if (!mounted) return;
          
          setStats(qbtStats);
        } else {
          setStats(null);
        }
      } catch {
        if (!mounted) return;
        setStatus('offline');
        setStats(null);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 15000);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await apiClient.getFrontendConfig();
        if (mounted) setFrontendConfig(cfg.services?.qbittorrent || null);
      } catch (err) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Helper function to format bytes
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Helper function to format speed
  const formatSpeed = (bytesPerSecond: number) => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  // Helper function to format uptime
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    if (hours > 0) {
      return `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;
    }
    return `${Math.floor(seconds / 60)}m`;
  };

  // Helper function to get connection status color
  const getConnectionStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'connected':
      case 'firewalled':
        return 'text-green-600';
      case 'disconnected':
        return 'text-red-600';
      default:
        return 'text-yellow-600';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <QBittorrentIcon className="h-4 w-4 text-[#2f5bea]" />
          qBittorrent
        </CardTitle>
        <ServerStatusBadge status={status} />
      </CardHeader>
      {stats && (
        <CardContent className="space-y-3">
          {/* Main info grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-xs text-gray-500">Version</div>
              <div className="font-mono font-semibold text-sm">{stats.version}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-gray-500">Host</div>
              <div className="font-mono font-semibold text-sm">
                {(() => {
                  const cfgHost = frontendConfig?.host || null;
                  const cfgPort = frontendConfig?.webPort ? String(frontendConfig.webPort) : null;
                  const connPort = stats.connection.port ? String(stats.connection.port) : null;
                  const hostOnly = cfgHost ? cfgHost.replace(/^https?:\/\//i, '').replace(/\/.*/, '').trim() : null;
                  const display = hostOnly ? (cfgPort ? `${hostOnly}:${cfgPort}` : (connPort ? `${hostOnly}:${connPort}` : hostOnly)) : (connPort ? `localhost:${connPort}` : 'Unknown');
                  const href = (() => {
                    if (!hostOnly) return null;
                    const portToUse = cfgPort || connPort;
                    return `http://${hostOnly}${portToUse ? `:${portToUse}` : ''}`;
                  })();

                  return href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1">
                      <span className="truncate">{display}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    display
                  );
                })()}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-gray-500">Total Torrents</div>
              <div className="font-mono font-semibold text-sm">{stats.torrents.total}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-gray-500">Free Space</div>
              <div className="font-mono font-semibold text-sm">{formatBytes(stats.freeSpaceOnDisk)}</div>
            </div>
          </div>

          {/* Torrent status grid */}
          <div className="border-t pt-3">
            <div className="text-xs text-gray-500 mb-2">Torrent Status</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-xs text-gray-500">Downloading</div>
                <div className="font-mono font-semibold text-sm text-blue-600">{stats.torrents.downloading}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-gray-500">Seeding</div>
                <div className="font-mono font-semibold text-sm text-green-600">{stats.torrents.seeding}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-gray-500">Paused</div>
                <div className="font-mono font-semibold text-sm text-yellow-600">{stats.torrents.paused}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-gray-500">Completed</div>
                <div className="font-mono font-semibold text-sm text-emerald-600">{stats.torrents.completed}</div>
              </div>
            </div>
          </div>

          {/* Transfer speeds */}
          <div className="border-t pt-3">
            <div className="text-xs text-gray-500 mb-2">Transfer Rates</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-xs text-gray-500">Download</div>
                <div className="font-mono font-semibold text-sm text-blue-600">
                  {formatSpeed(stats.transfer.dlSpeed)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-gray-500">Upload</div>
                <div className="font-mono font-semibold text-sm text-green-600">
                  {formatSpeed(stats.transfer.upSpeed)}
                </div>
              </div>
            </div>
          </div>

          {/* Session totals */}
          <div className="border-t pt-3">
            <div className="text-xs text-gray-500 mb-2">Session Totals</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-xs text-gray-500">Downloaded</div>
                <div className="font-mono font-semibold text-sm">
                  {formatBytes(stats.transfer.dlSession)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-gray-500">Uploaded</div>
                <div className="font-mono font-semibold text-sm">
                  {formatBytes(stats.transfer.upSession)}
                </div>
              </div>
            </div>
          </div>

          {/* Connection info */}
          <div className="border-t pt-3">
            <div className="text-xs text-gray-500 mb-2">Connection</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-xs text-gray-500">Status</div>
                <div className={`font-mono font-semibold text-sm capitalize ${getConnectionStatusColor(stats.connection.status)}`}>
                  {stats.connection.status}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-gray-500">Port</div>
                <div className="font-mono font-semibold text-sm">{stats.connection.port}</div>
              </div>
              {stats.connection.dhtNodes > 0 && (
                <div className="space-y-1 col-span-2">
                  <div className="text-xs text-gray-500">DHT Nodes</div>
                  <div className="font-mono font-semibold text-sm">{stats.connection.dhtNodes.toLocaleString()}</div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};