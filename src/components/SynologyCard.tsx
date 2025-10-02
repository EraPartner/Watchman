import React, { useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Progress } from "./ui/progress";
import {
  ExternalLink,
  Cpu,
  Thermometer,
  Server,
  Network,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { ServerStatusBadge } from "./ServerStatusBadge";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../services/ApiClient";
import { useFrontendConfig } from "../hooks/useServicesHealth";
import { formatDisplayUrl, buildHref, openHref } from "../lib/url";

// Updated interfaces to match your backend's actual data structure
interface SynologyStats {
  status: "online" | "offline" | "error";
  timestamp: string;
  system?: {
    name: string;
    uptime: number;
    model: string;
    version: string;
    status: string;
  };
  cpu?: {
    usage: number;
    temperature: number;
  };
  network?: {
    bytesReceived: number;
    bytesTransmitted: number;
  };
  lastUpdated?: string;
  errors?: Array<{ component: string; error: string }>;
  error?: string;
}

const formatBytes = (bytes?: number | null): string => {
  if (!Number.isFinite(bytes) || (bytes ?? 0) === 0) return "0 B";
  const b = Math.max(0, bytes || 0);
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(k)), sizes.length - 1);
  return `${(b / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

const clampPercentage = (v?: number) => {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
};

const SynologyCard: React.FC = () => {
  const statusQuery = useQuery({
    queryKey: ["synology", "status"],
    queryFn: () => apiClient.getSynologyStatus(),
    refetchInterval: 30000,
    retry: 1,
  });

  const statsQuery = useQuery({
    queryKey: ["synology", "stats"],
    queryFn: () => apiClient.getSynologyStats(),
    refetchInterval: 30000,
    retry: 1,
  });

  const frontendConfigQuery = useFrontendConfig();

  const status = statusQuery.data as any;
  const stats = statsQuery.data as SynologyStats | undefined;
  const cfg = (frontendConfigQuery.data as any)?.services?.synology ?? null;

  // Show loading if either query is loading (previously used && which required both)
  const loading = statusQuery.isLoading || statsQuery.isLoading;
  const isOnline = status?.status === "online" || stats?.status === "online";
  // ServiceHealth uses 'warning'/'not_configured' while stats may use 'error'
  const hasError =
    status?.status === "warning" ||
    status?.status === "not_configured" ||
    stats?.status === "error";

  // prefer stats.timestamp for detailed timestamp; fallback to status.lastCheck or now
  const lastUpdate = useMemo(
    () => new Date(stats?.timestamp || status?.lastCheck || Date.now()),
    [stats?.timestamp, status?.lastCheck]
  );

  // Compute host + href from frontend config (if available) and memoize to avoid recomputing each render
  const { synDisplay, synologyHref } = useMemo(() => {
    const synHost = cfg?.host ?? null;
    const synPort = cfg?.webPort ? String(cfg.webPort) : null;
    if (!synHost)
      return {
        synDisplay: null as string | null,
        synologyHref: null as string | null,
      };

    const hostOnly = synHost
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .trim();
    const display = hostOnly
      ? synPort
        ? `${hostOnly}:${synPort}`
        : hostOnly
      : synHost || null;
    const href = hostOnly
      ? `https://${hostOnly}${synPort ? `:${synPort}` : ""}`
      : null;
    return { synDisplay: display, synologyHref: href };
  }, [cfg?.host, cfg?.webPort]);

  const onRetry = useCallback(() => {
    statusQuery.refetch();
    statsQuery.refetch();
    frontendConfigQuery.refetch();
  }, [statusQuery, statsQuery, frontendConfigQuery]);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Server className="h-4 w-4" />
          Synology NAS
        </CardTitle>
        <ServerStatusBadge
          status={
            loading
              ? "loading"
              : isOnline
              ? "online"
              : hasError
              ? "error"
              : "offline"
          }
        />
      </CardHeader>

      <CardContent className="space-y-4">
        {stats?.system ? (
          <div className="grid grid-cols-1 gap-4 text-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Server className="h-3 w-3" />
                Model
              </div>
              <div className="font-medium">
                {stats?.system?.model || "Unknown"}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Server className="h-3 w-3" />
                Host
              </div>
              <div className="font-medium">
                {synologyHref ? (
                  <button
                    onClick={() => openHref(synologyHref)}
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors flex items-center gap-1 mt-1 w-fit"
                    title={`Open ${synDisplay || cfg?.host} in new tab`}
                  >
                    <span className="truncate">
                      {formatDisplayUrl(synDisplay || cfg?.host)}
                    </span>
                    <ExternalLink className="h-3 w-3" />
                  </button>
                ) : (
                  synDisplay || cfg?.host || "Unknown"
                )}
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {isOnline && stats && (
          <div className="space-y-4">
            {stats.cpu && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Cpu className="h-3 w-3" />
                    CPU Usage
                  </div>
                  <span className="font-medium">
                    {clampPercentage(stats.cpu.usage)}%
                  </span>
                </div>
                <Progress
                  value={clampPercentage(stats.cpu.usage)}
                  className="h-2"
                />

                {stats.cpu.temperature && stats.cpu.temperature > 0 && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Thermometer className="h-3 w-3" />
                      Temperature
                    </div>
                    <span>{stats.cpu.temperature}°C</span>
                  </div>
                )}
              </div>
            )}

            {stats.network && (
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-muted-foreground text-sm">
                  <Network className="h-3 w-3" />
                  Network Activity
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted rounded-md p-2">
                    <div className="text-xs text-muted-foreground">
                      Download
                    </div>
                    <div className="text-sm font-medium">
                      {formatBytes(stats.network.bytesReceived || 0)}
                    </div>
                  </div>
                  <div className="bg-muted rounded-md p-2">
                    <div className="text-xs text-muted-foreground">Upload</div>
                    <div className="text-sm font-medium">
                      {formatBytes(stats.network.bytesTransmitted || 0)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {stats?.errors && stats.errors.length > 0 && isOnline && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2">
            <div className="text-xs text-yellow-800 font-medium mb-1">
              ⚠️ Some data unavailable:
            </div>
            <div className="text-xs text-yellow-700">
              {stats.errors.map((e) => e.component).join(", ")} failed to load
            </div>
          </div>
        )}

        {!isOnline && !loading && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
            <div className="text-sm text-muted-foreground mb-2">
              {hasError ? "Connection Error" : "Synology NAS is offline"}
            </div>
            {(stats?.error || status?.error) && (
              <div className="text-xs text-red-500 max-w-full break-words">
                {stats?.error || status?.error}
              </div>
            )}
            <div className="mt-3 text-xs">
              <button
                onClick={onRetry}
                className="text-blue-500 hover:text-blue-700 underline"
                disabled={loading}
              >
                Retry Connection
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SynologyCard;
