import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ServerStatusBadge } from "./ServerStatusBadge";
import { UpdateBadge } from "./UpdateBadge";
import {
  Database,
  Link as LinkIcon,
  Map as MapIcon,
  Server,
  Users,
} from "lucide-react";
import ServiceLink from "@/components/ServiceLink";
import { formatBytes, instanceDisplayName } from "../lib/utils";
import { useFrontendConfig } from "../hooks/useFrontendConfig";
import { useServiceHealth, useServiceStats } from "../hooks/useServiceHealth";
import type { FrontendConfig } from "../services/ApiClient";

interface IpfsStats {
  version?: string;
  Version?: string;
  addresses?: unknown[] | number;
  peers?: number | string;
  repo?: {
    repoSize?: number | string;
    RepoSize?: number | string;
    repoSizeBytes?: number | string;
  };
  bw?: {
    totalIn?: number | string;
    TotalIn?: number | string;
    totalOut?: number | string;
    TotalOut?: number | string;
    rateIn?: number | string;
    RateIn?: number | string;
    rateInBytes?: number | string;
    rateOut?: number | string;
    RateOut?: number | string;
  };
}

interface IpfsCardProps {
  name?: string;
  instanceId?: string;
  instanceNumber?: number;
}

export const IpfsCard: React.FC<IpfsCardProps> = ({
  name = "IPFS",
  instanceId = "ipfs",
  instanceNumber,
}) => {
  const displayName = instanceDisplayName(name, instanceNumber);

  const { data: frontendConfigData } = useFrontendConfig();
  const frontendCfg = (frontendConfigData as FrontendConfig | undefined)
    ?.services?.ipfs;

  const { data: healthData } = useServiceHealth(instanceId);
  const rawStatus = healthData?.status;
  const status =
    rawStatus === "not_configured"
      ? "offline"
      : rawStatus === undefined
        ? "loading"
        : (rawStatus as "online" | "offline" | "warning" | "loading");

  const statsEnabled = status === "online" || status === "warning";
  const { data: statsData } = useServiceStats(instanceId, statsEnabled);
  const stats = statsData as IpfsStats | undefined;

  const buildLink = () => {
    const webUrl = frontendCfg?.webUrl ?? null;
    if (webUrl)
      return (
        <ServiceLink
          raw={webUrl}
          preferHttps={true}
          title="Open IPFS Web UI"
          compact
          hostOnly
        />
      );

    const host = frontendCfg?.host ?? null;
    const port = frontendCfg?.port ?? null;
    if (host) {
      const raw = `${host}${port ? `:${port}` : ""}`;
      return (
        <ServiceLink
          raw={raw}
          preferHttps={false}
          title="Open IPFS node"
          compact
          hostOnly
        />
      );
    }

    return "Unknown";
  };

  const formatRate = (bytesPerSec: number | null | undefined) => {
    if (bytesPerSec === null || bytesPerSec === undefined) return "N/A";
    return `${formatBytes(bytesPerSec)}/s`;
  };

  const addressesCount = Array.isArray(stats?.addresses)
    ? stats.addresses.length
    : typeof stats?.addresses === "number"
      ? stats.addresses
      : null;
  const peersCount =
    typeof stats?.peers === "number"
      ? stats.peers
      : stats?.peers
        ? Number(stats.peers)
        : 0;
  const repoSize =
    stats?.repo?.repoSize ??
    stats?.repo?.RepoSize ??
    stats?.repo?.repoSizeBytes ??
    null;
  const bwIn = stats?.bw?.totalIn ?? stats?.bw?.TotalIn ?? 0;
  const bwOut = stats?.bw?.totalOut ?? stats?.bw?.TotalOut ?? 0;
  const rateIn =
    stats?.bw?.rateIn ?? stats?.bw?.RateIn ?? stats?.bw?.rateInBytes ?? 0;
  const rateOut = stats?.bw?.rateOut ?? stats?.bw?.RateOut ?? 0;

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex flex-col">
          <CardTitle className="text-sm font-medium">{displayName}</CardTitle>
          {buildLink()}
        </div>
        <div className="flex items-center gap-2">
          {statsEnabled && <UpdateBadge service="ipfs" />}
          <ServerStatusBadge status={status} />
        </div>
      </CardHeader>

      {stats && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Server className="h-3 w-3" /> Version
              </div>
              <div className="font-mono font-semibold text-sm">
                {stats?.version || stats?.Version || "Unknown"}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <LinkIcon className="h-3 w-3" /> Node
              </div>
              <div className="font-medium text-xs">{buildLink()}</div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <MapIcon className="h-3 w-3" /> Addresses
              </div>
              <div className="font-mono font-semibold text-sm">
                {addressesCount !== null ? addressesCount : "Unknown"}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Users className="h-3 w-3" /> Peers
              </div>
              <div className="font-mono font-semibold text-sm">
                {peersCount}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Database className="h-3 w-3" /> Repo Size
              </div>
              <div className="font-mono font-semibold text-sm">
                {repoSize ? formatBytes(Number(repoSize)) : "N/A"}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Server className="h-3 w-3" /> Bandwidth
              </div>
              <div className="font-mono font-semibold text-sm">
                In: {bwIn !== null ? formatBytes(Number(bwIn)) : "N/A"} / Out:{" "}
                {bwOut !== null ? formatBytes(Number(bwOut)) : "N/A"}
              </div>
            </div>

            <div className="col-span-2 border-t pt-3">
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                Realtime rates
              </div>
              <div className="font-mono font-semibold text-sm">
                In: {rateIn !== null ? formatRate(Number(rateIn)) : "N/A"} ·
                Out: {rateOut !== null ? formatRate(Number(rateOut)) : "N/A"}
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};
