import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { AlertCircle } from "lucide-react";
import { ServerStatusBadge } from "./ServerStatusBadge";
import { UpdateBadge } from "./UpdateBadge";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../services/ApiClient";
import { useEnabledServices } from "../hooks/useEnabledServices";
import { APP_CONFIG } from "../lib/constants";
import { queryKeys } from "../lib/queryKeys";

interface HomebridgeCardProps {
  instanceId?: string;
  instanceNumber?: number;
}

type HomebridgeQueryError = { message?: string };

type HomebridgeBaseResponse = {
  error?: string;
  warning?: string;
  message?: string;
  timestamp?: string;
};

type HomebridgeVersionResponse = HomebridgeBaseResponse & {
  installedVersion?: string;
  installed_version?: string;
  installed?: string;
  version?: string;
  homebridgeVersion?: string;
  homebridge_version?: string;
  raw?: {
    installedVersion?: string;
    installed_version?: string;
    installed?: string;
    version?: string;
    homebridgeVersion?: string;
    homebridge_version?: string;
  };
};

type HomebridgeServerResponse = HomebridgeBaseResponse & {
  data?: {
    installedVersion?: string;
    installed_version?: string;
    installed?: string;
    version?: string;
    homebridgeVersion?: string;
    homebridge_version?: string;
    serverVersion?: string;
    uptime?: number | string;
    time?: { uptime?: number | string };
    raw?: {
      installedVersion?: string;
      installed_version?: string;
      installed?: string;
      version?: string;
      homebridgeVersion?: string;
      homebridge_version?: string;
      serverVersion?: string;
      time?: { uptime?: number | string };
    };
  };
};

type HomebridgeAccessoryInstance = {
  connectionFailedCount?: number;
};

type HomebridgeAccessory = {
  instance?: HomebridgeAccessoryInstance;
};

type HomebridgeAccessoriesResponse = HomebridgeBaseResponse & {
  data?: HomebridgeAccessory[];
  lastData?: {
    data?: HomebridgeAccessory[];
  };
};

const getErrorMessage = (error: unknown): string | undefined => {
  if (!error || typeof error !== "object") return undefined;
  return (error as HomebridgeQueryError).message;
};

const getInstalledVersion = (
  versionResp: HomebridgeVersionResponse | undefined,
  serverResp: HomebridgeServerResponse | undefined
): string => {
  if (versionResp) {
    const installed =
      versionResp.installedVersion ||
      versionResp.installed_version ||
      versionResp.installed ||
      versionResp.raw?.installedVersion ||
      versionResp.raw?.installed_version ||
      versionResp.raw?.installed;
    if (installed) return String(installed);

    const generic =
      versionResp.version ||
      versionResp.homebridgeVersion ||
      versionResp.homebridge_version ||
      versionResp.raw?.version ||
      versionResp.raw?.homebridgeVersion ||
      versionResp.raw?.homebridge_version;
    if (generic) return String(generic);
  }

  const fallbackServerData = serverResp?.data;
  if (fallbackServerData) {
    const installed =
      fallbackServerData.installedVersion ||
      fallbackServerData.installed_version ||
      fallbackServerData.installed ||
      fallbackServerData.raw?.installedVersion ||
      fallbackServerData.raw?.installed_version ||
      fallbackServerData.raw?.installed;
    if (installed) return String(installed);

    const generic =
      fallbackServerData.version ||
      fallbackServerData.homebridgeVersion ||
      fallbackServerData.homebridge_version ||
      fallbackServerData.serverVersion ||
      fallbackServerData.raw?.version ||
      fallbackServerData.raw?.homebridgeVersion ||
      fallbackServerData.raw?.homebridge_version ||
      fallbackServerData.raw?.serverVersion;
    if (generic) return String(generic);
  }

  return "N/A";
};

const getUptimeDisplay = (
  serverResp: HomebridgeServerResponse | undefined
): string => {
  const uptimeValue =
    serverResp?.data?.uptime ||
    serverResp?.data?.time?.uptime ||
    serverResp?.data?.raw?.time?.uptime;

  if (uptimeValue === undefined) return "N/A";

  const n = Number(uptimeValue);
  if (Number.isNaN(n)) return String(uptimeValue);
  if (n < 60) return `${n}s`;

  const hours = Math.floor(n / 3600);
  const minutes = Math.floor((n % 3600) / 60);
  const parts: string[] = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!hours && !minutes) parts.push(`${n}s`);
  return parts.join(" ");
};

const HomebridgeCard: React.FC<HomebridgeCardProps> = ({
  instanceId = "homebridge",
  instanceNumber,
}) => {
  const { isServiceEnabled } = useEnabledServices();
  const isEnabled = isServiceEnabled("homebridge");

  const displayName = instanceNumber
    ? `Homebridge #${instanceNumber}`
    : "Homebridge";

  // Fetch server-information from allowed API endpoint.
  const serverInfoQuery = useQuery<HomebridgeServerResponse>({
    queryKey: queryKeys.homebridgeServerInformation(instanceId),
    queryFn: () => apiClient.getHomebridgeServerInformation(),
    refetchInterval: APP_CONFIG.DEFAULT_REFRESH_INTERVAL,
    retry: 1,
    enabled: isEnabled,
  });

  // Fetch version from the allowed version endpoint (/api/status/homebridge-version)
  const versionQuery = useQuery<HomebridgeVersionResponse>({
    queryKey: queryKeys.homebridgeVersion(instanceId),
    queryFn: () => apiClient.getHomebridgeVersion(),
    refetchInterval: APP_CONFIG.DEFAULT_REFRESH_INTERVAL,
    retry: 1,
    enabled: isEnabled,
  });

  // Fetch accessories list from backend /api/accessories
  const accessoriesQuery = useQuery<HomebridgeAccessoriesResponse>({
    queryKey: queryKeys.homebridgeAccessories(instanceId),
    queryFn: () => apiClient.getHomebridgeAccessories(),
    refetchInterval: APP_CONFIG.DEFAULT_REFRESH_INTERVAL,
    retry: 1,
    enabled: isEnabled,
  });

  const loading =
    serverInfoQuery.isLoading ||
    versionQuery.isLoading ||
    accessoriesQuery.isLoading;
  const serverInfoResp = serverInfoQuery.data;
  const versionResp = versionQuery.data;
  const accessoriesResp = accessoriesQuery.data;
  const accessoriesWarning =
    accessoriesResp?.warning || accessoriesResp?.message;

  // Prefer react-query statuses: success = online, error = hasError
  const isOnline =
    serverInfoQuery.isSuccess ||
    versionQuery.isSuccess ||
    accessoriesQuery.isSuccess;
  const hasError =
    serverInfoQuery.isError || versionQuery.isError || accessoriesQuery.isError;

  // Query-level error messages
  const serverQueryError = serverInfoQuery.isError
    ? getErrorMessage(serverInfoQuery.error) || String(serverInfoQuery.error)
    : null;
  const versionQueryError = versionQuery.isError
    ? getErrorMessage(versionQuery.error) || String(versionQuery.error)
    : null;
  const accessoriesQueryError = accessoriesQuery.isError
    ? getErrorMessage(accessoriesQuery.error) || String(accessoriesQuery.error)
    : null;
  const errorMessage =
    serverQueryError ||
    versionQueryError ||
    serverInfoResp?.error ||
    versionResp?.error ||
    null;
  const combinedError = errorMessage || accessoriesQueryError || null;

  const uptimeDisplay = getUptimeDisplay(serverInfoResp);
  const versionFinal = getInstalledVersion(versionResp, serverInfoResp);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{displayName}</CardTitle>
        <div className="flex items-center gap-2">
          {isOnline && <UpdateBadge service="homebridge" />}
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
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 text-sm">
          {/* Showing version (from installedVersion), uptime, platform, last seen */}
        </div>

        {(serverInfoQuery.isSuccess || versionQuery.isSuccess) && (
          <div className="space-y-4">
            {accessoriesWarning && (
              <div className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
                {String(accessoriesWarning)}
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground text-xs">Version</div>
              <div className="font-medium">{versionFinal}</div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground text-xs">Uptime</div>
              <div className="font-medium">{uptimeDisplay}</div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground text-xs">Last seen</div>
              <div className="font-medium">
                {new Date(
                  serverInfoResp?.timestamp ||
                    versionResp?.timestamp ||
                    Date.now()
                ).toLocaleTimeString()}
              </div>
            </div>
          </div>
        )}

        {!isOnline && !loading && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
            <div className="text-sm text-muted-foreground mb-2">
              {hasError ? "Connection Error" : "Homebridge is offline"}
            </div>
            {combinedError && (
              <div className="text-xs text-red-500 max-w-full break-words">
                {combinedError}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default HomebridgeCard;
