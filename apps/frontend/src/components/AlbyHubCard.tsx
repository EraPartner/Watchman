import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ServerStatusBadge } from "./ServerStatusBadge";
import { useEnabledServices } from "../hooks/useEnabledServices";
import { useServiceHealth } from "../hooks/useServiceHealth";
import { useFrontendConfig } from "../hooks/useFrontendConfig";
import type { FrontendConfig } from "../services/ApiClient";
import { ExternalLink, Server } from "lucide-react";
import { formatDisplayUrl, openHref } from "../lib/url";
import { instanceDisplayName } from "../lib/utils";

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

  const displayName = instanceDisplayName("Alby Hub", instanceNumber);

  const { data: healthData } = useServiceHealth(instanceId, {
    enabled: isEnabled,
  });
  const { data: frontendConfigData } = useFrontendConfig();

  const rawStatus = healthData?.status;
  const status =
    rawStatus === "not_configured" || rawStatus === undefined
      ? rawStatus === undefined
        ? "loading"
        : "offline"
      : (rawStatus as "online" | "offline" | "warning");

  const frontendCfg = frontendConfigData as FrontendConfig | undefined;
  const albyUrlRaw = frontendCfg?.services?.albyhub?.url ?? null;

  let backendDisplay: string | null = null;
  let backendHref: string | null = null;
  if (albyUrlRaw) {
    try {
      const withProto = /^[a-z]+:\/\//i.test(albyUrlRaw)
        ? albyUrlRaw
        : `http://${albyUrlRaw}`;
      const parsed = new URL(withProto);
      backendHref = parsed.origin;
      backendDisplay = parsed.hostname + (parsed.port ? `:${parsed.port}` : "");
    } catch {
      backendDisplay = albyUrlRaw;
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
