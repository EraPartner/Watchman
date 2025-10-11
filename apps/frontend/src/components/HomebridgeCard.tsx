import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { AlertCircle, Server } from "lucide-react";
import { ServerStatusBadge } from "./ServerStatusBadge";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../services/ApiClient";
import { APP_CONFIG } from "../lib/constants";

const HomebridgeCard: React.FC = () => {
  // Fetch server-information from allowed API endpoint.
  const serverInfoQuery = useQuery({
    queryKey: ["homebridge", "server-information"],
    queryFn: () => apiClient.getHomebridgeServerInformation(),
    refetchInterval: APP_CONFIG.ADGUARD_REFRESH_INTERVAL,
    retry: 1,
  });

  // Fetch version from the allowed version endpoint (/api/status/homebridge-version)
  const versionQuery = useQuery({
    queryKey: ["homebridge", "homebridge-version"],
    queryFn: () => apiClient.getHomebridgeVersion(),
    refetchInterval: APP_CONFIG.ADGUARD_REFRESH_INTERVAL,
    retry: 1,
  });

  // Fetch accessories list from backend /api/accessories
  const accessoriesQuery = useQuery({
    queryKey: ["homebridge", "accessories"],
    queryFn: () => apiClient.getHomebridgeAccessories(),
    refetchInterval: APP_CONFIG.ADGUARD_REFRESH_INTERVAL,
    retry: 1,
  });

  const loading =
    serverInfoQuery.isLoading ||
    versionQuery.isLoading ||
    accessoriesQuery.isLoading ||
    serverInfoQuery.isFetching ||
    versionQuery.isFetching ||
    accessoriesQuery.isFetching;
  const serverInfoResp = serverInfoQuery.data as any;
  const versionResp = versionQuery.data as any;
  const accessoriesResp = accessoriesQuery.data as any;

  // Prefer react-query statuses: success = online, error = hasError
  const isOnline =
    serverInfoQuery.isSuccess ||
    versionQuery.isSuccess ||
    accessoriesQuery.isSuccess;
  const hasError =
    serverInfoQuery.isError || versionQuery.isError || accessoriesQuery.isError;

  // Query-level error messages
  const serverQueryError = serverInfoQuery.isError
    ? (serverInfoQuery.error as any)?.message || String(serverInfoQuery.error)
    : null;
  const versionQueryError = versionQuery.isError
    ? (versionQuery.error as any)?.message || String(versionQuery.error)
    : null;
  const accessoriesQueryError = accessoriesQuery.isError
    ? (accessoriesQuery.error as any)?.message || String(accessoriesQuery.error)
    : null;
  const errorMessage =
    serverQueryError ||
    versionQueryError ||
    serverInfoResp?.error ||
    versionResp?.error ||
    null;
  const combinedError = errorMessage || accessoriesQueryError || null;

  // Normalize server data (support either resp.data or resp directly)
  const serverData = serverInfoResp && (serverInfoResp.data || serverInfoResp);

  // Extract services from the /api/accessories response. Each element in the returned
  // array represents a service (aid/iid). Support common wrapper shapes like
  // { data: [...] }, { accessories: [...] } or { services: [...] }.
  const servicesArray: any[] = (() => {
    if (!accessoriesResp) return [];

    const tryExtract = (obj: any): any[] | null => {
      if (!obj) return null;
      if (Array.isArray(obj)) return obj;
      if (obj.services && Array.isArray(obj.services)) return obj.services;
      if (obj.accessories && Array.isArray(obj.accessories))
        return obj.accessories;
      if (obj.data && Array.isArray(obj.data)) return obj.data;
      if (obj.items && Array.isArray(obj.items)) return obj.items;
      if (obj.raw && Array.isArray(obj.raw)) return obj.raw;
      if (obj.data && typeof obj.data === "object") {
        if (Array.isArray(obj.data.services)) return obj.data.services;
        if (Array.isArray(obj.data.accessories)) return obj.data.accessories;
      }
      return null;
    };

    return (
      tryExtract(accessoriesResp) ||
      tryExtract(accessoriesResp.data) ||
      tryExtract(accessoriesResp.raw) ||
      []
    );
  })();

  // Count total services and online services. Treat a service as offline when
  // instance.connectionFailedCount > 0. If instance info is absent, assume online.
  const totalServices = servicesArray.length;
  const onlineServicesCount = servicesArray.reduce((acc, s) => {
    try {
      const inst = s && s.instance;
      if (!inst) return acc + 1;
      const failed = inst.connectionFailedCount;
      if (typeof failed === "number") return failed > 0 ? acc : acc + 1;
      return acc + 1;
    } catch (e) {
      return acc;
    }
  }, 0);

  // Helper to safely read nested fields from various shapes
  const getFirst = (obj: any, paths: string[][]) => {
    for (const p of paths) {
      let cur = obj;
      let ok = true;
      for (const k of p) {
        if (cur == null) {
          ok = false;
          break;
        }
        cur = cur[k];
      }
      if (ok && cur !== undefined && cur !== null) return cur;
    }
    return null;
  };

  // Helper to pretty-print server information safely, with uptime formatting
  const formatUptime = (u: any) => {
    if (u == null) return null;
    // If it's a number (seconds), convert to human friendly string
    const n = Number(u);
    if (!Number.isNaN(n)) {
      if (n < 60) return `${n}s`;
      const hours = Math.floor(n / 3600);
      const minutes = Math.floor((n % 3600) / 60);
      const parts: string[] = [];
      if (hours) parts.push(`${hours}h`);
      if (minutes) parts.push(`${minutes}m`);
      if (!hours && !minutes) parts.push(`${n}s`);
      return parts.join(" ");
    }
    // Otherwise return as-is (string)
    return String(u);
  };

  const uptimeValue = getFirst(serverData, [
    ["uptime"],
    ["time", "uptime"],
    ["raw", "time", "uptime"],
  ]);
  const uptimeDisplay = uptimeValue ? formatUptime(uptimeValue) : "N/A";

  // Extract installedVersion from the version endpoint response with safe fallbacks
  const versionFinal = (() => {
    const vr = versionResp;
    if (!vr) {
      // If version endpoint not available, try to find version in serverData/raw
      const sd = serverData || serverInfoResp || null;
      if (!sd) return "N/A";
      const sCandidate = typeof sd === "object" && sd.data ? sd.data : sd;
      return (
        sCandidate?.installedVersion ||
        sCandidate?.installed_version ||
        sCandidate?.version ||
        sCandidate?.homebridgeVersion ||
        "N/A"
      );
    }

    // Normalize candidate (support resp.data or resp)
    const candidate = typeof vr === "object" && vr.data ? vr.data : vr;
    // First look for installedVersion fields
    const installed =
      candidate?.installedVersion ||
      candidate?.installed_version ||
      candidate?.installed ||
      (candidate?.raw &&
        (candidate.raw.installedVersion ||
          candidate.raw.installed_version ||
          candidate.raw.installed));
    if (installed) return String(installed);
    // Fall back to generic version keys
    const generic =
      candidate?.version ||
      candidate?.homebridgeVersion ||
      candidate?.homebridge_version ||
      (candidate?.raw &&
        (candidate.raw.version ||
          candidate.raw.homebridgeVersion ||
          candidate.raw.homebridge_version));
    if (generic) return String(generic);
    return "N/A";
  })();

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Server className="h-4 w-4" />
          Homebridge
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
        <div className="grid grid-cols-1 gap-4 text-sm">
          {/* Showing version (from installedVersion), uptime, platform, last seen */}
        </div>

        {(serverInfoQuery.isSuccess || versionQuery.isSuccess) && (
          <div className="space-y-4">
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
                    Date.now(),
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
