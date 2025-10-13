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
  Radio,
  RefreshCw,
  Server,
  Thermometer,
} from "lucide-react";
import { ServerStatusBadge } from "./ServerStatusBadge";
import { buildHref, openHref } from "../lib/url";

interface RaspberryPiCardProps {
  serviceName?: string;
  displayName?: string;
  enableStats?: boolean;
  webUrl?: string;
  priority?: "high" | "medium" | "low";
}

// Helper to format bytes into human-readable format
function humanBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Helper to format uptime in seconds to human-readable format
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export const RaspberryPiCard = memo<RaspberryPiCardProps>(
  ({
    serviceName = "raspi",
    displayName = "Raspberry Pi",
    enableStats = true,
    webUrl,
    priority = "medium",
  }) => {
    const {
      data: health,
      isLoading: healthLoading,
      error: healthError,
      refetch: refetchHealth,
    } = useServiceHealth(serviceName, {
      refetchInterval:
        priority === "high" ? 5000 : priority === "medium" ? 10000 : 20000,
      enabled: true,
      staleTime: priority === "high" ? 2000 : 5000,
    });

    const { data: stats, isLoading: statsLoading } = useServiceStats(
      serviceName,
      enableStats,
    );

    const statusMetrics = useMemo(() => {
      if (!health) return null;

      const getStatusColor = (status: string) => {
        switch (status) {
          case "online":
            return "bg-green-500 text-green-50";
          case "offline":
            return "bg-red-500 text-red-50";
          case "warning":
            return "bg-yellow-500 text-yellow-50";
          default:
            return "bg-gray-500 text-gray-50";
        }
      };

      return {
        statusColor: getStatusColor(health.status as any),
        isHealthy: health.status === "online",
      };
    }, [health]);

    const formattedStats = useMemo(() => {
      if (!stats || !enableStats) return null;

      // Debug log to see what stats we're receiving
      console.log("🔍 Raspberry Pi Card received stats:", stats);

      const entries: { key: string; value: string; isImportant?: boolean }[] =
        [];

      // Pi Model
      if (stats.piModel) {
        entries.push({
          key: "model",
          value: String(stats.piModel),
          isImportant: true,
        });
      }

      // CPU Temperature
      if (stats.cpuTemp != null) {
        entries.push({
          key: "temperature",
          value: `${stats.cpuTemp}°C`,
          isImportant: true,
        });
      }

      // Clock Rate
      if (stats.clockRate != null) {
        entries.push({
          key: "clock rate",
          value: `${stats.clockRate} MHz`,
          isImportant: true,
        });
      }

      // Memory usage
      if (stats.memory) {
        entries.push({
          key: "memory",
          value: `${stats.memory.usedMB}/${stats.memory.totalMB} MB (${stats.memory.usedPercent}%)`,
          isImportant: false,
        });
      }

      // Load Average
      if (stats.loadAverage) {
        entries.push({
          key: "load avg",
          value: `${stats.loadAverage.load1.toFixed(2)}`,
          isImportant: false,
        });
      }

      // Uptime (from pigpio tick)
      if (stats.uptime != null) {
        entries.push({
          key: "uptime",
          value: formatUptime(stats.uptime),
          isImportant: false,
        });
      }

      // pigpio version
      if (stats.pigpioVersion != null) {
        entries.push({
          key: "pigpio",
          value: String(stats.pigpioVersion),
          isImportant: false,
        });
      }

      // Port
      if (stats.port) {
        entries.push({
          key: "port",
          value: String(stats.port),
          isImportant: false,
        });
      }

      console.log("📋 Formatted entries:", entries);

      return entries;
    }, [stats, enableStats]);

    const isLoading = healthLoading || (enableStats && statsLoading);
    const hasError = !!healthError;

    return (
      <Card className={`h-full transition-all duration-300 hover:shadow-lg`}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-semibold">
                {displayName}
              </CardTitle>
            </div>
            {statusMetrics && (
              <ServerStatusBadge
                status={
                  (health?.status as any) || (health ? "offline" : "loading")
                }
              />
            )}
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
                {String((healthError as any)?.message || "Unknown error")}
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
                {((health as any)?.data?.host || (stats as any)?.host) && (
                  <span className="text-xs text-muted-foreground ml-2">
                    IP: {(health as any)?.data?.host || (stats as any)?.host}
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
                        className="text-xs text-muted-foreground truncate flex items-center gap-1 justify-center"
                        title={key}
                      >
                        {key.includes("temp") ? (
                          <Thermometer className="h-3 w-3" />
                        ) : key.includes("clock") ? (
                          <Cpu className="h-3 w-3" />
                        ) : key.includes("pigpio") ? (
                          <Radio className="h-3 w-3" />
                        ) : key.includes("uptime") ? (
                          <Clock className="h-3 w-3" />
                        ) : null}
                        {key}
                      </div>
                      <div
                        className={`text-sm font-mono ${
                          isImportant ? "font-semibold" : ""
                        }`}
                        title={value}
                      >
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!formattedStats && health?.status === "online" && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  Connected to pigpiod on port{" "}
                  {(health as any)?.data?.port || 8888}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  },
);

RaspberryPiCard.displayName = "RaspberryPiCard";
