import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Globe, Wifi, AlertTriangle } from "lucide-react";
import { ServerStatus } from "../types/server";
import { useConfig } from "../hooks/use-config";
import { ServerStatusBadge } from "./ServerStatusBadge";
import { buildHref, openHref } from "../lib/url";
import ServiceLink from "@/components/ServiceLink";

export const NostrcheckCard: React.FC<any> = ({
  name,
  status,
  url,
  fullHeight = false,
}) => {
  const { config } = useConfig();

  // Read backend config values
  const nostrCfg = config?.services?.nostrcheck as
    | { webUrl?: string | null; relayUrl?: string | null }
    | undefined;

  // Relay (raw) — the URL user asked to show under the name
  const relayRaw = nostrCfg?.relayUrl || url || "localhost:3000";
  // Web UI — the clickable web UI URL to show under the "Relay" section (NOSTRCHECK_WEB_URL)
  const webRaw = nostrCfg?.webUrl || null;

  // Build hrefs and use ServiceLink for consistent display
  const relayHref = buildHref(relayRaw, false);
  const webHref = buildHref(webRaw, true);
  const openRelay = () => openHref(relayHref);
  const openWeb = () => openHref(webHref);

  return (
    <Card className={`w-full ${fullHeight ? "h-full" : ""}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex flex-col">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {name}
          </CardTitle>
          {/* Clickable relay URL under the name (NOSTRCHECK_RELAY_URL) */}
          <ServiceLink
            raw={relayRaw}
            preferHttps={false}
            title="Open relay"
            compact
          />
        </div>

        <div className="flex items-center gap-2">
          <ServerStatusBadge status={status} />
          {status !== "online" && (
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Wifi className="h-3 w-3" />
              Relay
            </div>
            {/* Under the Relay section show the clickable Web UI URL (NOSTRCHECK_WEB_URL) when available */}
            {webHref ? (
              <ServiceLink
                raw={webRaw}
                preferHttps={true}
                title="Open web UI"
              />
            ) : (
              <div className="font-mono font-semibold text-sm">{relayRaw}</div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={openRelay}>
              Open Relay
            </Button>
            {webHref && (
              <Button variant="outline" size="sm" onClick={openWeb}>
                Open Web UI
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Use named export only (no default export)
