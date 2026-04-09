import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import {
  AlertCircle,
  ExternalLink,
  Network,
  RefreshCw,
  Server,
} from "lucide-react";
import { ServerStatusBadge } from "./ServerStatusBadge";
import { formatDisplayUrl, formatPingDisplay, openHref } from "../lib/url";
import { usePingServiceCard } from "../hooks/usePingServiceCard";

interface PhilipsBridgeCardProps {
  instanceId?: string;
  instanceNumber?: number;
}

const PhilipsBridgeCard: React.FC<PhilipsBridgeCardProps> = ({
  instanceId = "philips",
  instanceNumber,
}) => {
  const displayName = instanceNumber
    ? `Philips Bridge #${instanceNumber}`
    : "Philips Bridge";

  const {
    loading,
    status,
    stats,
    isOnline,
    hasError,
    hostValue,
    hostHref,
    ping,
    errorMessage,
  } = usePingServiceCard({ serviceKey: "philips", instanceId });

  const statusBadgeValue = loading
    ? "loading"
    : isOnline
      ? "online"
      : hasError
        ? "error"
        : "offline";

  if (loading && !status && !stats) {
    return (
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Server className="h-4 w-4" />
            Philips Bridge
          </CardTitle>
          <ServerStatusBadge status={statusBadgeValue} />
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Server className="h-4 w-4" />
          {displayName}
        </CardTitle>
        <ServerStatusBadge status={statusBadgeValue} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 text-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Server className="h-3 w-3" />
              Host
            </div>
            <div className="font-medium">
              {hostHref ? (
                <button
                  onClick={() => openHref(hostHref)}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors flex items-center gap-1 mt-1 w-fit"
                  title={`Open ${hostValue} in new tab`}
                >
                  <span className="truncate">
                    {formatDisplayUrl(hostValue)}
                  </span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              ) : (
                hostValue || "Unknown"
              )}
            </div>
          </div>
        </div>

        {(stats?.data || status?.data) && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Network className="h-3 w-3" />
                Ping
              </div>
              <div className="text-right">
                <div className="font-medium">
                  {formatPingDisplay(ping)}
                </div>
              </div>
            </div>
          </div>
        )}

        {!isOnline && !loading && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
            <div className="text-sm text-muted-foreground mb-2">
              {hasError ? "Connection Error" : "Philips Bridge is offline"}
            </div>
            {errorMessage && (
              <div className="text-xs text-red-500 max-w-full break-words">
                {errorMessage}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PhilipsBridgeCard;
