import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ServerStatusBadge } from "./ServerStatusBadge";
import { apiClient } from "../services/ApiClient";
import { useEnabledServices } from "../hooks/useEnabledServices";
import { ExternalLink, Server } from "lucide-react";
import { formatDisplayUrl, openHref } from "../lib/url";

interface AlbyHubCardProps {
  fullHeight?: boolean;
  instanceId?: string;
  instanceNumber?: number;
}

export const AlbyHubCard: React.FC<AlbyHubCardProps> = ({
  fullHeight = false,
  instanceId = "albyhub",
  instanceNumber,
}) => {
  const { isServiceEnabled } = useEnabledServices();
  const isEnabled = isServiceEnabled("albyhub");

  const displayName = instanceNumber
    ? `Alby Hub #${instanceNumber}`
    : "Alby Hub";

  const [status, setStatus] = useState<
    "online" | "offline" | "warning" | "loading"
  >("loading");
  // albyUrlRaw holds the ALBYHUB_URL value exposed via backend /api/config/frontend
  const [albyUrlRaw, setAlbyUrlRaw] = useState<string | null>(null);

  useEffect(() => {
    if (!isEnabled) return;

    let mounted = true;

    const fetchHealth = async () => {
      try {
        const health = await apiClient.getServiceHealth(instanceId);
        if (!mounted) return;
        const mapped =
          health.status === "not_configured"
            ? "offline"
            : health.status || "offline";
        setStatus(mapped as any);
      } catch (err) {
        if (!mounted) return;
        setStatus("offline");
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isEnabled, instanceId]);

  // Fetch frontend config once to read the ALBYHUB_URL provided by backend
  useEffect(() => {
    if (!isEnabled) return;

    let mounted = true;
    (async () => {
      try {
        const cfg = await apiClient.getFrontendConfig();
        if (!mounted) return;
        const alby = cfg?.services?.albyhub;
        if (alby && alby.url) setAlbyUrlRaw(alby.url);
      } catch (e) {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Build display URL from backend-provided ALBYHUB_URL: show host:port (no protocol, no path)
  let backendDisplay: string | null = null;
  let backendHref: string | null = null;
  if (albyUrlRaw) {
    try {
      // ensure URL has protocol for parsing
      const withProto = /^[a-z]+:\/\//i.test(albyUrlRaw)
        ? albyUrlRaw
        : `http://${albyUrlRaw}`;
      const parsed = new URL(withProto);
      backendHref = parsed.origin;
      backendDisplay = parsed.hostname + (parsed.port ? `:${parsed.port}` : "");
    } catch (e) {
      backendDisplay = albyUrlRaw; // fallback to raw
      backendHref = null;
    }
  }

  return (
    <Card className={`w-full ${fullHeight ? "h-full" : ""}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {displayName}
        </CardTitle>
        <ServerStatusBadge status={status} />
      </CardHeader>

      {status !== "loading" && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Server className="h-3 w-3" />
                Status
              </div>
              <div className="font-mono font-semibold text-sm capitalize">
                {status}
              </div>
            </div>
          </div>

          {/* Single URL display (sourced from backend's ALBYHUB_URL via /api/config/frontend) */}
          <div className="border-t pt-3">
            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              <Server className="h-3 w-3" /> URL
            </div>
            <div>
              {backendHref ? (
                <button
                  onClick={() => openHref(backendHref)}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors flex items-center gap-1 mt-1 w-fit"
                  title={`Open ${backendDisplay}`}
                >
                  <span className="truncate">
                    {formatDisplayUrl(backendDisplay)}
                  </span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              ) : (
                <div className="font-mono font-semibold text-sm">
                  Configured via backend
                </div>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default AlbyHubCard;
