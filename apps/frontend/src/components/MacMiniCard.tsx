import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useServiceHealth, useServiceStats } from "@/hooks/useServiceHealth";
import {
  Activity,
  AlertTriangle,
  Clock,
  Cpu,
  ExternalLink,
  HardDrive,
  RefreshCw,
  Server,
  Thermometer,
} from "lucide-react";
import { ServerStatusBadge } from "./ServerStatusBadge";
import { buildHref, openHref } from "../lib/url";
import { useEnabledServices } from "@/hooks/useEnabledServices.ts";
import { formatBytes, formatUptime } from "../lib/utils";
import type { ServiceHealth } from "../services/ApiClient";

interface MacMiniCardProps {
  serviceName?: string; // defaults to 'macmini' to match backend route
  displayName?: string;
  enableStats?: boolean;
  webUrl?: string;
  priority?: "high" | "medium" | "low";
  instanceId?: string;
  instanceNumber?: number;
}

type MacMiniDiskStats = {
  total?: number;
  used?: number;
  usagePercent?: number;
};

type MacMiniStats = {
  cpuLoad?: number | string;
  cpuTemp?: number;
  uptime?: number;
  host?: string;
  disk?: MacMiniDiskStats;
};

type HealthWithData = ServiceHealth & { data?: { host?: string } };

export const MacMiniCard = memo<MacMiniCardProps>(
  ({
    serviceName = "macmini",
    displayName = "Mac Mini",
    enableStats = true,
    webUrl,
    priority = "medium",
    instanceId = "macmini",
    instanceNumber,
  }) => {
    const { isServiceEnabled } = useEnabledServices();
    const isEnabled = isServiceEnabled(serviceName);

    const finalDisplayName = instanceNumber
      ? `${displayName} #${instanceNumber}`
      : displayName;

    const {
      data: health,
      isLoading: healthLoading,
      error: healthError,
      refetch: refetchHealth,
    } = useServiceHealth(instanceId, {
      refetchInterval:
        priority === "high" ? 5000 : priority === "medium" ? 10000 : 20000,
      enabled: isEnabled,
      staleTime: priority === "high" ? 2000 : 5000,
    });

    const { data: stats, isLoading: statsLoading } = useServiceStats(
      instanceId,
      enableStats && isEnabled
    );

    const typedHealth = health as HealthWithData | undefined;
    const typedStats = stats as MacMiniStats | undefined;
    const badgeStatus = health
      ? health.status === "not_configured"
        ? "offline"
        : health.status
      : "loading";

    const statusMetrics = useMemo(() => {
      if (!health) return null;

      return {
        isHealthy: health.status === "online",
      };
    }, [health]);

    const formattedStats = useMemo(() => {
      if (!typedStats || !enableStats) return null;

      const entries: { key: string; value: string; isImportant?: boolean }[] =
        [];

      // CPU load (may be 1m/5m/15m or single value)
      if (typedStats?.cpuLoad != null) {
        const v =
          typeof typedStats.cpuLoad === "number"
            ? `${typedStats.cpuLoad}%`
            : String(typedStats.cpuLoad);
        entries.push({ key: "cpu load", value: v, isImportant: true });
      }

      // CPU temperature
      if (typedStats?.cpuTemp != null) {
        entries.push({
          key: "cpu temp",
          value: `${typedStats.cpuTemp}°C`,
          isImportant: true,
        });
      }

      // Disk usage - show used/total and percent if available
      if (typedStats?.disk) {
        if (typeof typedStats.disk === "object") {
          const total =
            typedStats.disk.total != null
              ? formatBytes(typedStats.disk.total)
              : "N/A";
          const used =
            typedStats.disk.used != null
              ? formatBytes(typedStats.disk.used)
              : "N/A";
          entries.push({
            key: "disk used",
            value: `${used} / ${total}`,
            isImportant: true,
          });
        }
      }

      // Uptime or load average
      if (typedStats?.uptime != null) {
        entries.push({
          key: "uptime",
          value: formatUptime(typedStats.uptime),
          isImportant: false,
        });
      }

      return entries;
    }, [typedStats, enableStats]);

    const isLoading = healthLoading || (enableStats && statsLoading);
    const hasError = !!healthError;

    return (
      <Card className={`h-full transition-all duration-300 hover:shadow-lg `}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-semibold">
                {finalDisplayName}
              </CardTitle>
            </div>
            {statusMetrics && <ServerStatusBadge status={badgeStatus} />}
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {statusMetrics?.isHealthy ? "reachable" : "unreachable"}
            </Badge>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchHealth()}
              disabled={isLoading}
              className="h-8 w-8 p-0"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </Button>

            {webUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openHref(buildHref(webUrl, true))}
                className="h-8 w-8 p-0"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                <span className="text-sm text-muted-foreground">
                  Loading...
                </span>
              </div>
            </div>
          ) : hasError ? (
            <div className="flex items-center gap-2 py-4 text-red-600 bg-red-50 rounded-lg px-3">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">
                Failed to load:{" "}
                {healthError instanceof Error
                  ? healthError.message
                  : "Unknown error"}
              </span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                <Activity className="h-4 w-4" />
                <span className="text-sm font-medium flex items-center gap-1">
                  <Server className="h-3 w-3" /> Status:
                </span>
                <span className="text-sm">{health?.status || "Unknown"}</span>
                {/* Show configured host/IP when available (from health data or stats) */}
                {(typedHealth?.data?.host || typedStats?.host) && (
                  <span className="text-xs text-muted-foreground ml-2">
                    IP: {typedHealth?.data?.host || typedStats?.host}
                  </span>
                )}
                {health?.lastCheck && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(health.lastCheck).toLocaleTimeString()}
                  </span>
                )}
              </div>

              {formattedStats && formattedStats.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {formattedStats.map(({ key, value, isImportant }) => (
                    <div
                      key={key}
                      className={`p-2 rounded border text-center ${
                        isImportant
                          ? "bg-primary/5 border-primary/20"
                          : "bg-muted/30"
                      }`}
                    >
                      <div
                        className="text-xs text-muted-foreground truncate flex items-center gap-1"
                        title={key}
                      >
                        {key.includes("cpu") ? (
                          <Cpu className="h-3 w-3" />
                        ) : key.includes("temp") ? (
                          <Thermometer className="h-3 w-3" />
                        ) : key.includes("uptime") ? (
                          <Clock className="h-3 w-3" />
                        ) : (
                          <HardDrive className="h-3 w-3" />
                        )}
                        {key}
                      </div>
                      <div
                        className={`text-sm font-mono ${
                          isImportant ? "font-semibold" : ""
                        }`}
                      >
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!formattedStats && (
                <div className="text-sm text-muted-foreground">
                  No stats available
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);

MacMiniCard.displayName = "MacMiniCard";
