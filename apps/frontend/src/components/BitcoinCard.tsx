import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ServerStatusBadge } from "./ServerStatusBadge";
import { UpdateBadge } from "./UpdateBadge";
import { BitcoinStats } from "../types/api";
import { apiClient } from "../services/ApiClient";
import {
  Clock,
  Database,
  DownloadCloud,
  Layers,
  Link as LinkIcon,
  Network,
  Server,
} from "lucide-react";

// Bitcoin logo SVG component
const BitcoinIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 24C18.6274 24 24 18.6274 24 12C24 5.37258 18.6274 0 12 0C5.37258 0 0 5.37258 0 12C0 18.6274 5.37258 24 12 24ZM10.5 7.5V9H11.5C12.3284 9 13 9.67157 13 10.5C13 11.3284 12.3284 12 11.5 12H10.5V13.5H11.5C12.8807 13.5 14 12.3807 14 11C14 9.61929 12.8807 8.5 11.5 8.5H10.5V7.5ZM9 7.5V8.5H8.5C7.67157 8.5 7 9.17157 7 10C7 10.8284 7.67157 11.5 8.5 11.5H9V13.5H8.5C7.67157 13.5 7 14.1716 7 15C7 15.8284 7.67157 16.5 8.5 16.5H9V17.5H10.5V16.5H11.5C12.8807 16.5 14 15.3807 14 14C14 12.6193 12.8807 11.5 11.5 11.5H10.5V10.5H11.5C12.3284 10.5 13 11.1716 13 12C13 12.8284 12.3284 13.5 11.5 13.5H10.5V15H11.5C12.3284 15 13 14.3284 13 13.5C13 12.6716 12.3284 12 11.5 12H10.5Z"
      fill="#F7931A"
    />
  </svg>
);

export const BitcoinCard: React.FC = () => {
  const [status, setStatus] = useState<
    "online" | "offline" | "warning" | "loading"
  >("loading");
  const [stats, setStats] = useState<BitcoinStats | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      try {
        const health = await apiClient.getBitcoinStatus();

        if (!mounted) return;

        // Handle the not_configured status by treating it as offline
        const mappedStatus =
          health.status === "not_configured" ? "offline" : health.status;
        setStatus(mappedStatus as "online" | "offline" | "warning" | "loading");

        if (health.status === "online" || health.status === "warning") {
          const nodeStats = await apiClient.getBitcoinStats();

          if (!mounted) return;

          setStats(nodeStats as BitcoinStats);
        } else {
          setStats(null);
        }
      } catch {
        if (!mounted) return;
        setStatus("offline");
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

  // Helper function to format version
  const formatVersion = (version: string) => {
    // Extract version number from "/Satoshi:29.1.0/" format
    const match = version.match(/\/Satoshi:([^/]+)\//);
    return match ? match[1] : version;
  };

  // Helper function to format large numbers
  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toLocaleString();
  };

  // Helper function to format bytes
  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${bytes} B`;
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

  // Helper function to format percentage
  const formatPercentage = (decimal: number) => {
    return `${(decimal * 100).toFixed(2)}%`;
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BitcoinIcon className="h-4 w-4 text-[#F7931A]" />
          Bitcoin Core
        </CardTitle>
        <div className="flex items-center gap-2">
          {status !== "loading" && status !== "offline" && (
            <UpdateBadge service="bitcoin" />
          )}
          <ServerStatusBadge status={status} />
        </div>
      </CardHeader>
      {stats && (
        <CardContent className="space-y-3">
          {/* Main info grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Server className="h-3 w-3" />
                Version
              </div>
              <div className="font-mono font-semibold text-sm">
                {formatVersion(stats.version)}
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <LinkIcon className="h-3 w-3" />
                Chain
              </div>
              <div className="font-mono font-semibold text-sm capitalize">
                {stats.chain}
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Layers className="h-3 w-3" />
                Blocks
              </div>
              <div className="font-mono font-semibold text-sm">
                {formatNumber(stats.blocks)}
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Clock className="h-3 w-3" />
                Uptime
              </div>
              <div className="font-mono font-semibold text-sm">
                {formatUptime(stats.uptime)}
              </div>
            </div>
          </div>

          {/* Chain size (on-disk) */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Database className="h-3 w-3" />
              Chain Size
            </div>
            <div className="font-mono font-semibold text-sm">
              {formatBytes(stats.blockchainSize ?? 0)}
            </div>
          </div>

          {/* Sync Progress */}
          {stats.verificationProgress < 1 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <DownloadCloud className="h-3 w-3" /> Sync Progress
                </span>
                <span>{formatPercentage(stats.verificationProgress)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${stats.verificationProgress * 100}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Connections */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Network className="h-3 w-3" />
              Network Connections
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="text-center p-1 bg-gray-50 rounded">
                <div className="font-mono font-semibold">
                  {stats.connections}
                </div>
                <div className="text-gray-500">Total</div>
              </div>
              <div className="text-center p-1 bg-green-50 rounded">
                <div className="font-mono font-semibold text-green-600">
                  ↓ {stats.inbound}
                </div>
                <div className="text-gray-500">In</div>
              </div>
              <div className="text-center p-1 bg-blue-50 rounded">
                <div className="font-mono font-semibold text-blue-600">
                  ↑ {stats.outbound}
                </div>
                <div className="text-gray-500">Out</div>
              </div>
            </div>
          </div>

          {/* Mempool */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Database className="h-3 w-3" />
              Mempool
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="space-y-0.5">
                <div className="font-mono font-semibold">
                  {formatNumber(stats.mempool.size)}
                </div>
                <div className="text-gray-500">Transactions</div>
              </div>
              <div className="space-y-0.5">
                <div className="font-mono font-semibold">
                  {formatBytes(stats.mempool.bytes)}
                </div>
                <div className="text-gray-500">Size</div>
              </div>
            </div>
            <div className="text-xs text-gray-500">
              Usage: {formatBytes(stats.mempool.usage)} /{" "}
              {formatBytes(stats.mempool.maxmempool)}
              <span className="ml-1">
                (
                {(
                  (stats.mempool.usage / stats.mempool.maxmempool) *
                  100
                ).toFixed(1)}
                %)
              </span>
            </div>
          </div>

          {/* Status indicators */}
          <div className="flex gap-2 text-xs">
            <div
              className={`px-2 py-1 rounded-full ${
                stats.initialBlockDownload
                  ? "bg-yellow-100 text-yellow-800"
                  : "bg-green-100 text-green-800"
              }`}
            >
              {stats.initialBlockDownload ? "Syncing" : "Synced"}
            </div>
            {stats.verificationProgress >= 0.9999 && (
              <div className="px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                Full Node
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
};
