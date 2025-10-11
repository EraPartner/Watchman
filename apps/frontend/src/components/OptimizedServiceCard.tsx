import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useClearCache,
  useServiceHealth,
  useServiceStats,
} from "@/hooks/useServiceHealth";
import {
  Activity,
  BarChart2,
  Clock,
  RefreshCw,
  Server,
  Trash2,
} from "lucide-react";
import { ServerStatusBadge } from "./ServerStatusBadge";

interface OptimizedServiceCardProps {
  serviceName: string;
  displayName: string;
  enableStats?: boolean;
}

// Memoized component to prevent unnecessary re-renders
export const OptimizedServiceCard = memo(
  ({
    serviceName,
    displayName,
    enableStats = true,
  }: OptimizedServiceCardProps) => {
    const {
      data: health,
      isLoading: healthLoading,
      error: healthError,
      refetch: refetchHealth,
    } = useServiceHealth(serviceName);

    const {
      data: stats,
      isLoading: statsLoading,
      error: statsError,
    } = useServiceStats(serviceName, enableStats);

    const clearCacheMutation = useClearCache();

    const handleClearCache = () => {
      clearCacheMutation.mutate();
    };

    const isLoading = healthLoading || (enableStats && statsLoading);
    const hasError = healthError || (enableStats && statsError);

    return (
      <Card className="h-full transition-all duration-200 hover:shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg font-semibold">{displayName}</CardTitle>
          <div className="flex items-center gap-2">
            {/* Status indicator */}
            <ServerStatusBadge
              status={
                (health?.status as any) ||
                (healthLoading ? "loading" : "offline")
              }
            />

            {/* Performance indicator */}
            {health?.responseTime && (
              <Badge variant="outline" className="text-xs">
                {health.responseTime}ms
              </Badge>
            )}

            {/* Action buttons */}
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

            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearCache}
              disabled={clearCacheMutation.isPending}
              className="h-8 w-8 p-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          )}

          {hasError && (
            <div className="text-red-500 text-sm py-4">
              <p>Error: {healthError?.message || statsError?.message}</p>
            </div>
          )}

          {!isLoading && !hasError && health && (
            <div className="space-y-4">
              {/* Health Status */}
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                <span className="text-sm font-medium flex items-center gap-1">
                  <Server className="h-3 w-3" /> Status:
                </span>
                <ServerStatusBadge
                  status={(health?.status as any) || "offline"}
                />
              </div>

              {/* Stats if available */}
              {stats && enableStats && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-1">
                    <BarChart2 className="h-3 w-3" /> Statistics:
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(stats)
                      .slice(0, 4)
                      .map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {key}:
                          </span>
                          <span className="font-mono">{String(value)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Performance metrics */}
              {health.responseTime && (
                <div className="text-xs text-muted-foreground">
                  Response Time: {health.responseTime}ms
                </div>
              )}

              {health.lastCheck && (
                <div className="text-xs text-muted-foreground">
                  Last Check: {new Date(health.lastCheck).toLocaleTimeString()}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  },
);

OptimizedServiceCard.displayName = "OptimizedServiceCard";
