import React, { useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ServerStatusBadge } from "./ServerStatusBadge";
import { AlertCircle, ExternalLink, RefreshCw, Server } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../services/ApiClient";
import { useEnabledServices } from "../hooks/useEnabledServices";
import { Button } from "./ui/button";
import { buildHref, formatDisplayUrl, openHref } from "../lib/url";

interface RouterCardProps {
  name: string; // display name
  serviceKey: string; // key used in backend services health (e.g. 'beryl' | 'telenet')
  instanceId?: string;
  instanceNumber?: number;
}

const RouterCard: React.FC<RouterCardProps> = ({
  name,
  serviceKey,
  instanceNumber,
}) => {
  const { isServiceEnabled } = useEnabledServices();
  const isEnabled = isServiceEnabled(serviceKey);

  const displayName = instanceNumber ? `${name} #${instanceNumber}` : name;

  // Reuse the shared services health endpoint (react-query will dedupe)
  const healthQuery = useQuery({
    queryKey: ["services", "health"],
    queryFn: () => apiClient.getServicesHealth(),
    refetchInterval: 30000,
    retry: 1,
    enabled: true, // Always fetch - backend only returns enabled services
  });

  // Frontend configuration query (declare early so dependent hooks can use it)
  const frontendCfgQuery = useQuery({
    queryKey: ["frontend", "config"],
    queryFn: () => apiClient.getFrontendConfig(),
    refetchInterval: 60000,
    retry: 1,
  });

  // Decide whether ARP lookup should be enabled (only if serviceKey and a host is known)
  type ServicesMap = Record<
    string,
    Partial<{
      host: string;
      status: string;
      responseTime: number;
      response_time: number;
      lastCheck: string;
      timestamp: string;
      error: string;
      icmpAlive: boolean;
    }>
  >;
  const arpEnabled =
    isEnabled &&
    (() => {
      const svc = (
        healthQuery.data?.services as unknown as ServicesMap | undefined
      )?.[serviceKey];
      if (svc?.host) return true;
      const fcfg = (
        frontendCfgQuery.data as unknown as
          | { services?: Record<string, { host?: string }> }
          | undefined
      )?.services?.[serviceKey];
      return Boolean(fcfg?.host);
    })();

  type ArpHosts = { ip: string; mac?: string; iface?: string }[];
  type ArpLan = { count: number; hosts: ArpHosts };
  type ArpResp = {
    count: number;
    hosts: ArpHosts;
    lan?: ArpLan;
    note?: string;
    raw?: string;
  };
  const arpQuery = useQuery<ArpResp>({
    queryKey: ["router", "arp", serviceKey],
    queryFn: async () => {
      // First try the high-level apiClient if available
      if (
        apiClient &&
        typeof (
          apiClient as unknown as {
            getRouterArp?: (s: string) => Promise<ArpResp>;
          }
        ).getRouterArp === "function"
      ) {
        return await (
          apiClient as unknown as {
            getRouterArp: (s: string) => Promise<ArpResp>;
          }
        ).getRouterArp(serviceKey);
      }

      // Fallback: directly fetch the backend endpoint so the UI stays functional
      const url = `/api/router/arp?service=${encodeURIComponent(
        String(serviceKey),
      )}`;
      const resp = await fetch(url, { credentials: "include" });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(
          `ARP fetch failed: ${resp.status} ${resp.statusText} ${text}`,
        );
      }
      return (await resp.json()) as ArpResp;
    },
    refetchInterval: 30000,
    retry: 1,
    // only run if a host is configured (prevents spurious calls)
    enabled: arpEnabled,
  });

  const serviceObj = healthQuery.data?.services
    ? (healthQuery.data.services as unknown as ServicesMap)[serviceKey]
    : null;

  const selectedArp =
    arpQuery.data &&
    arpQuery.data.lan &&
    Array.isArray(arpQuery.data.lan.hosts) &&
    arpQuery.data.lan.hosts.length > 0
      ? arpQuery.data.lan
      : arpQuery.data || null;
  const connectedCount = selectedArp ? (selectedArp.count ?? null) : null;
  const connectedHosts = selectedArp?.hosts ?? [];
  const arpLoading = arpQuery.isLoading || arpQuery.isFetching;
  const totalArpCount = arpQuery.data ? (arpQuery.data.count ?? null) : null;
  const arpNote = arpQuery.data?.note ?? null;
  const arpRaw = arpQuery.data?.raw ?? null;
  const [showRaw, setShowRaw] = React.useState(false);

  // Robust arp error extraction
  let arpError: string | null = null;
  if (arpQuery.error) {
    const e = arpQuery.error as Error | { message?: string; error?: string };
    if (e && typeof (e as Error).message === "string")
      arpError = (e as Error).message;
    else if (typeof (e as { error?: string }).error === "string")
      arpError = String((e as { error?: string }).error);
    else arpError = String(e);
    console.debug("RouterCard: ARP error for", serviceKey, arpError);
  }

  const status = serviceObj
    ? (serviceObj.status as string)
    : healthQuery.isLoading
      ? "loading"
      : "not_configured";
  const responseTime =
    serviceObj?.responseTime ?? serviceObj?.response_time ?? null;
  const lastCheck = serviceObj?.lastCheck ?? serviceObj?.timestamp ?? null;
  const error = serviceObj?.error ?? null;

  // Try to read a host/port from frontend config if backend exposes it under services.<serviceKey>
  const frontendServiceCfg = (
    frontendCfgQuery.data as unknown as {
      services?: Record<
        string,
        { webUrl?: string; host?: string; ip?: string }
      >;
    }
  )?.services?.[serviceKey];
  // Prefer host reported by the service health endpoint (serviceObj.host), fallback to frontend config
  const displayHost = useMemo(() => {
    // Prefer an explicit frontend-provided webUrl (includes non-default ports)
    if (frontendServiceCfg && frontendServiceCfg.webUrl)
      return formatDisplayUrl(frontendServiceCfg.webUrl);
    // Next prefer host from the service health object (same host but may not include port)
    if (serviceObj && serviceObj.host) return String(serviceObj.host);
    // Fallback to frontend config host/ip if available
    if (
      frontendServiceCfg &&
      (frontendServiceCfg.host || frontendServiceCfg.ip)
    ) {
      const candidate = frontendServiceCfg.host || frontendServiceCfg.ip;
      return candidate ? String(candidate) : null;
    }
    return null;
  }, [serviceObj, frontendServiceCfg]);

  // Build the href that should be opened when clicking the host link.
  // If backend provided a `webUrl` use it directly (preserves port). Otherwise fallback to displayHost and buildHref.
  const hostHref = useMemo(() => {
    if (frontendServiceCfg && frontendServiceCfg.webUrl) {
      const raw = String(frontendServiceCfg.webUrl);
      // If it already has a scheme, return as-is; otherwise build with http
      const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw);
      return hasScheme ? raw : `http://${raw}`;
    }
    if (serviceObj && serviceObj.host)
      return buildHref(String(serviceObj.host), false);
    if (
      frontendServiceCfg &&
      (frontendServiceCfg.host || frontendServiceCfg.ip)
    ) {
      const candidate = frontendServiceCfg.host || frontendServiceCfg.ip;
      return buildHref(String(candidate), false);
    }
    return null;
  }, [frontendServiceCfg, serviceObj]);

  // Additional HTTP fallback URL if available
  const httpFallbackHref = useMemo(() => {
    if (frontendServiceCfg && frontendServiceCfg.webUrl) {
      const raw = String(frontendServiceCfg.webUrl);
      // If the URL has a scheme and is not http, offer an http fallback
      const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw);
      if (hasScheme && !raw.startsWith("http://")) {
        // Replace https:// with http:// for the fallback
        return raw.replace(/^https:\/\//i, "http://");
      }
    }
    return null;
  }, [frontendServiceCfg]);

  const onRetry = useCallback(() => {
    healthQuery.refetch();
    frontendCfgQuery.refetch();
    // also retry ARP query instantly
    arpQuery.refetch?.();
  }, [healthQuery, frontendCfgQuery, arpQuery]);

  const isOnline = status === "online";
  const hasError =
    status === "warning" || status === "error" || status === "not_configured";

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2 justify-start">
          <Server className="h-4 w-4" />
          {displayName}
        </CardTitle>
        <ServerStatusBadge
          status={
            healthQuery.isLoading
              ? "loading"
              : isOnline
                ? "online"
                : hasError
                  ? "warning"
                  : "offline"
          }
        />
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Basic info row */}
        <div className="text-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span>Host</span>
            </div>
            <div className="text-sm font-medium truncate">
              {displayHost ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openHref(hostHref)}
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                  >
                    <span className="truncate">{displayHost}</span>
                    <ExternalLink className="h-3 w-3" />
                  </button>
                  {/* If we have an explicit http fallback that differs from the primary href, show a tiny fallback button */}
                  {httpFallbackHref && httpFallbackHref !== hostHref && (
                    <button
                      onClick={() => openHref(httpFallbackHref)}
                      title="Open HTTP fallback"
                      className="text-xs text-muted-foreground hover:text-gray-700"
                    >
                      (https)
                    </button>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">Unknown</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-muted-foreground">Status</div>
            <div
              className={`text-sm font-medium ${
                isOnline
                  ? "text-green-600"
                  : hasError
                    ? "text-yellow-600"
                    : "text-red-600"
              }`}
            >
              {status}
            </div>
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-muted-foreground">Response</div>
            <div className="text-sm font-mono">
              {serviceObj && serviceObj.icmpAlive
                ? responseTime
                  ? `ICMP ${responseTime}ms`
                  : "ICMP alive"
                : "N/A"}
            </div>
          </div>

          {/* Connected devices (ARP) */}
          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-muted-foreground">Connected</div>
            <div className="text-sm font-medium">
              {arpLoading ? (
                <span className="text-muted-foreground">Scanning...</span>
              ) : arpError ? (
                <span className="text-red-600">Error</span>
              ) : connectedCount !== null ? (
                // If we have both total and lan-filtered counts, show both for clarity
                totalArpCount !== null && totalArpCount !== connectedCount ? (
                  `${connectedCount} device${
                    connectedCount === 1 ? "" : "s"
                  } (LAN of ${totalArpCount})`
                ) : (
                  `${connectedCount} device${connectedCount === 1 ? "" : "s"}`
                )
              ) : (
                "N/A"
              )}
            </div>
          </div>

          {arpNote && (
            <div className="mt-1 text-xs text-muted-foreground">{arpNote}</div>
          )}

          {/* Small control to view raw ARP output when debugging */}
          {arpRaw && (
            <div className="mt-1">
              <button
                onClick={() => setShowRaw((s) => !s)}
                className="text-xs text-muted-foreground hover:underline"
              >
                {showRaw ? "Hide raw" : "Show raw"}
              </button>
              {showRaw && (
                <pre className="mt-1 text-xs text-muted-foreground bg-gray-50 p-2 rounded max-h-40 overflow-auto">
                  {arpRaw}
                </pre>
              )}
            </div>
          )}

          {/* Display ARP error message for debugging/visibility */}
          {arpError && (
            <div
              className="mt-1 text-xs text-red-600 truncate"
              title={arpError}
            >
              {arpError}
            </div>
          )}

          {connectedHosts && connectedHosts.length > 0 && (
            <div className="text-xs text-muted-foreground mt-1">
              {connectedHosts
                .slice(0, 3)
                .map((h) => h.ip)
                .join(", ")}
              {connectedHosts.length > 3
                ? ` (+${connectedHosts.length - 3} more)`
                : ""}
            </div>
          )}

          {lastCheck && (
            <div className="text-xs text-muted-foreground mt-2">
              Last: {new Date(lastCheck).toLocaleString()}
            </div>
          )}

          {error && (
            <div className="mt-3 text-xs text-red-600 bg-red-50 rounded p-2 flex items-start gap-2">
              <AlertCircle className="h-4 w-4" />
              <div className="truncate">{String(error)}</div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onRetry}>
            <RefreshCw
              className={`h-4 w-4 ${
                healthQuery.isFetching ? "animate-spin" : ""
              }`}
            />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default RouterCard;
