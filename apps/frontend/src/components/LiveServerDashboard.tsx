import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdGuardCard } from "./AdGuardCard";
import { TorCard } from "./TorCard";
import { AdGuardServerStats, TorServerStats } from "../types/server";
import {
  apiClient,
  FrontendConfig,
  ServiceHealth,
} from "../services/ApiClient";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Activity, CheckCircle, RefreshCw, Server, Shield } from "lucide-react";
import { Button } from "./ui/button";
import { APP_CONFIG } from "../lib/constants";
import { BitcoinCard } from "./BitcoinCard";
import { QBittorrentCard } from "./QBittorrentCard";
import { IpfsCard } from "./IpfsCard";
import { SynologyCard } from "./SynologyCard";
import { RoonCard } from "./RoonCard";
import PhilipsBridgeCard from "./PhilipsBridgeCard";
import { AlbyHubCard } from "./AlbyHubCard";
import { MacMiniCard } from "./MacMiniCard";
import { RaspberryPiCard } from "./RaspberryPiCard";
import { NostrcheckCard } from "./NostrcheckCard";
import RouterCard from "./RouterCard";
import HomebridgeCard from "./HomebridgeCard";
import { useEnabledServices } from "../hooks/useEnabledServices";
import { useServiceInstances } from "../hooks/useServiceInstances";

export const LiveServerDashboard = () => {
  const { isServiceEnabled } = useEnabledServices();
  const { getInstances } = useServiceInstances();
  const adguardEnabled = isServiceEnabled("adguard");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // AdGuard combined status + stats
  const adguardQuery = useQuery({
    queryKey: ["adguard", "full"],
    queryFn: async () => {
      const [health, stats] = await Promise.all([
        apiClient.getAdGuardStatus(),
        apiClient.getAdGuardStats(),
      ]);
      return { health, stats };
    },
    refetchInterval: APP_CONFIG.ADGUARD_REFRESH_INTERVAL,
    retry: 1,
    enabled: adguardEnabled,
  });

  const torQuery = useQuery({
    queryKey: ["tor", "relay"],
    queryFn: async () => {
      const [torStats, frontendConfig] = await Promise.all([
        apiClient.getTorRelay(),
        apiClient.getFrontendConfig(),
      ]);
      return { torStats, frontendConfig };
    },
    refetchInterval: APP_CONFIG.TOR_REFRESH_INTERVAL,
    retry: 1,
    enabled: isServiceEnabled("tor"),
  });

  const bitcoinQuery = useQuery({
    queryKey: ["bitcoin", "status"],
    queryFn: () => apiClient.getBitcoinStatus(),
    refetchInterval: 30000,
    retry: 1,
    enabled: isServiceEnabled("bitcoin"),
  });

  const qbittorrentQuery = useQuery({
    queryKey: ["qbittorrent", "status"],
    queryFn: () => apiClient.getQBittorrentStatus(),
    refetchInterval: 30000,
    retry: 1,
    enabled: isServiceEnabled("qbittorrent"),
  });

  const ipfsQuery = useQuery({
    queryKey: ["ipfs", "status"],
    queryFn: () => apiClient.getIpfsStatus(),
    refetchInterval: 30000,
    retry: 1,
    enabled: isServiceEnabled("ipfs"),
  });

  const synologyQuery = useQuery({
    queryKey: ["synology", "status"],
    queryFn: () => apiClient.getSynologyStatus(),
    refetchInterval: 60000,
    retry: 1,
    enabled: isServiceEnabled("synology"),
  });

  const roonQuery = useQuery({
    queryKey: ["roon", "status"],
    queryFn: () => apiClient.getRoonStatus(),
    refetchInterval: APP_CONFIG.ADGUARD_REFRESH_INTERVAL,
    retry: 1,
    enabled: isServiceEnabled("roon"),
  });

  // Global services health summary (returns health for ALL ENABLED services only)
  // This endpoint already filters disabled services on the backend
  const servicesHealthQuery = useQuery({
    queryKey: ["services", "health"],
    queryFn: () => apiClient.getServicesHealth(),
    refetchInterval: 30000,
    retry: 1,
    enabled: true, // Always fetch - endpoint returns only enabled services
  });

  const lastUpdateTime = new Date();

  // derive adguard/tor/other statuses from queries
  const adguardData = adguardQuery.data;
  const torData = torQuery.data;
  const frontendCfg: FrontendConfig | undefined = torData?.frontendConfig as
    | FrontendConfig
    | undefined;
  const bitcoinHealth = bitcoinQuery.data;
  const qbittorrentHealth = qbittorrentQuery.data;
  const ipfsHealth = ipfsQuery.data;
  const synologyHealth = synologyQuery.data;
  const roonHealth = roonQuery.data;

  // helper to map API service status strings to ServerStatus used by cards
  const mapServiceStatus = (s?: string) => {
    switch (s) {
      case "online":
        return "online" as const;
      case "warning":
        return "warning" as const;
      case "not_configured":
        return "offline" as const;
      case "offline":
        return "offline" as const;
      default:
        return "offline" as const;
    }
  };

  // Build a fallback normalized status list from the queries we already run in this component
  const fallbackNormalizedStatuses = [
    adguardData?.health?.status || "loading",
    torData?.torStats?.running ? "online" : torData ? "offline" : "loading",
    bitcoinHealth?.status || "loading",
    qbittorrentHealth?.status || "loading",
    ipfsHealth?.status || "loading",
    synologyHealth?.status || "loading",
    (roonHealth?.status === "error" ? "warning" : roonHealth?.status) ||
      "loading",
  ] as Array<"online" | "offline" | "warning" | "loading">;

  // If we have a services health response, we'll derive counts from it later.
  // For now declare placeholders; real values will be calculated after tiles are composed
  let totalServices: number | undefined;
  let onlineCount: number;
  let offlineCount: number;
  let warningCount: number;

  if (servicesHealthQuery.data && servicesHealthQuery.data.services) {
    type ServiceMap = Record<string, Partial<ServiceHealth>>;
    const svcObj = servicesHealthQuery.data.services as unknown as ServiceMap;
    const statuses = Object.values(svcObj).map((s) => {
      // Normalize backend status strings (map 'error' -> 'warning', 'not_configured' -> 'offline')
      const st = s && s.status ? String(s.status) : "offline";
      if (st === "error") return "warning";
      if (st === "not_configured") return "offline";
      return st as "online" | "offline" | "warning";
    });

    totalServices = statuses.length;
    onlineCount = statuses.filter((s) => s === "online").length;
    offlineCount = statuses.filter((s) => s === "offline").length;
    warningCount = statuses.filter((s) => s === "warning").length;
  } else {
    // fallback: compute total based on known tiles
    // softwareTiles/hardwareTiles are created further down; estimate from them if available later
    totalServices = fallbackNormalizedStatuses.length; // fallback to number of queries we run
    onlineCount = fallbackNormalizedStatuses.filter(
      (s) => s === "online",
    ).length;
    offlineCount = fallbackNormalizedStatuses.filter(
      (s) => s === "offline",
    ).length;
    warningCount = fallbackNormalizedStatuses.filter(
      (s) => s === "warning",
    ).length;
  }

  const totalQueries =
    (adguardData?.stats as AdGuardServerStats | undefined)?.totalQueries ?? 0;
  const totalBlocked =
    (adguardData?.stats as AdGuardServerStats | undefined)?.blockedQueries ?? 0;

  // Build card-ready AdGuard stats (map API shape to component shape)
  const adguardCardStats: AdGuardServerStats | undefined = adguardData?.stats
    ? {
        totalQueries: adguardData.stats.totalQueries ?? 0,
        blockedQueries: adguardData.stats.blockedQueries ?? 0,
        allowedQueries: adguardData.stats.allowedQueries ?? 0,
        blockingRate: adguardData.stats.blockingRate ?? 0,
        protectionEnabled: adguardData.stats.protectionEnabled ?? false,
        version: adguardData.stats.version ?? "Unknown",
        topBlockedDomain: adguardData.stats.topBlockedDomain ?? "N/A",
        topQueriedDomain: adguardData.stats.topQueriedDomain ?? "N/A",
        avgProcessingTime: adguardData.stats.avgProcessingTime ?? 0,
        running: adguardData.stats.running ?? false,
        timeUnits: adguardData.stats.timeUnits,
        topClient: adguardData.stats.topClient ?? "N/A",
        safebrowsingBlocked: adguardData.stats.safebrowsingBlocked ?? 0,
        safesearchBlocked: adguardData.stats.safesearchBlocked ?? 0,
        parentalBlocked: adguardData.stats.parentalBlocked ?? 0,
      }
    : undefined;

  // Build card-ready Tor stats (map API shape to component shape)
  type TorRaw = {
    version?: string;
    nickname?: string;
    fingerprint?: string;
    relayType?: string;
    bandwidth?: {
      current?: number;
      average?: number;
      burst?: number;
      observed?: number;
    };
    connections?: { current?: number; total?: number };
    circuits?: { active?: number; total?: number };
    flags?: string[];
    consensus_weight?: number;
    exit_policy?: string;
    hibernating?: boolean;
    orPort?: number;
    or_port?: number;
    controlPort?: number;
    running?: boolean;
    country?: string;
    city?: string;
    platform?: string;
    contact?: string;
  };
  const torRaw = torData?.torStats as Partial<TorRaw> | undefined;
  // frontendCfg already defined above
  const torCardStats: TorServerStats | undefined = torRaw
    ? {
        version: torRaw.version ?? "Unknown",
        nickname: torRaw.nickname ?? undefined,
        fingerprint: torRaw.fingerprint ?? "Unknown",
        relayType: (torRaw.relayType || "relay") as TorServerStats["relayType"],
        bandwidth: {
          current: (torRaw.bandwidth && torRaw.bandwidth.current) ?? 0,
          average: (torRaw.bandwidth && torRaw.bandwidth.average) ?? 0,
          burst: (torRaw.bandwidth && torRaw.bandwidth.burst) ?? 0,
          observed:
            (torRaw.bandwidth && torRaw.bandwidth.observed) ?? undefined,
        },
        connections: {
          current: (torRaw.connections && torRaw.connections.current) ?? 0,
          total: (torRaw.connections && torRaw.connections.total) ?? 0,
        },
        circuits: {
          active: (torRaw.circuits && torRaw.circuits.active) ?? 0,
          total: (torRaw.circuits && torRaw.circuits.total) ?? 0,
        },
        flags: torRaw.flags ?? [],
        consensusWeight: torRaw.consensus_weight ?? undefined,
        exitPolicy: torRaw.exit_policy ?? undefined,
        hibernating: torRaw.hibernating ?? false,
        orPort: torRaw.orPort ?? torRaw.or_port ?? undefined,
        controlPort: torRaw.controlPort ?? undefined,
        running: !!torRaw.running,
        country: torRaw.country ?? undefined,
        city: torRaw.city ?? undefined,
        platform: torRaw.platform ?? undefined,
        contact: torRaw.contact ?? undefined,
      }
    : undefined;

  const timeSinceUpdate = Math.floor(
    (Date.now() - lastUpdateTime.getTime()) / 1000,
  );

  // Refresh helper - refetch all enabled queries
  const handleRefresh = async () => {
    setIsRefreshing(true);
    const refreshPromises: Array<Promise<unknown>> = [];

    if (adguardEnabled) refreshPromises.push(adguardQuery.refetch());
    if (isServiceEnabled("tor")) refreshPromises.push(torQuery.refetch());
    if (isServiceEnabled("bitcoin"))
      refreshPromises.push(bitcoinQuery.refetch());
    if (isServiceEnabled("qbittorrent"))
      refreshPromises.push(qbittorrentQuery.refetch());
    if (isServiceEnabled("ipfs")) refreshPromises.push(ipfsQuery.refetch());
    if (isServiceEnabled("synology"))
      refreshPromises.push(synologyQuery.refetch());
    if (isServiceEnabled("roon")) refreshPromises.push(roonQuery.refetch());

    await Promise.all(refreshPromises);
    setIsRefreshing(false);
  };

  // loading indicator when initial queries are loading (only check enabled services)
  const enabledQueriesLoading = [
    adguardEnabled && adguardQuery.isLoading,
    isServiceEnabled("tor") && torQuery.isLoading,
    isServiceEnabled("bitcoin") && bitcoinQuery.isLoading,
    isServiceEnabled("qbittorrent") && qbittorrentQuery.isLoading,
    isServiceEnabled("ipfs") && ipfsQuery.isLoading,
    isServiceEnabled("synology") && synologyQuery.isLoading,
    isServiceEnabled("roon") && roonQuery.isLoading,
  ].filter(Boolean);

  // Only show loading spinner if we have enabled services and they're all loading
  if (
    enabledQueriesLoading.length > 0 &&
    enabledQueriesLoading.every((loading) => loading)
  ) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Precompute Tor IP and Port values for rendering
  const torIp: string | undefined = frontendCfg?.services?.tor?.ip ?? undefined;
  const torPortValue: number | undefined =
    frontendCfg?.services?.tor?.port ?? torCardStats?.orPort ?? undefined;

  // Helper: chunk an array into fixed-size rows
  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  };

  // Build arrays of tile elements so we can chunk and render rows exactly 3 per row
  const softwareTiles: React.ReactElement[] = [];

  // AdGuard - support multiple instances
  if (isServiceEnabled("adguard")) {
    const adguardInstances = getInstances("adguard");

    if (adguardInstances.length > 1) {
      // Multiple instances - render each one (will need separate data fetching)
      adguardInstances.forEach((instance) => {
        const instanceNumber = parseInt(instance.id.split("_")[1]) || undefined;
        // For now, use the first adguard data if available
        if (adguardData && adguardCardStats) {
          softwareTiles.push(
            <AdGuardCard
              key={instance.id}
              name={"AdGuard Home"}
              status={mapServiceStatus(adguardData.health.status)}
              stats={adguardCardStats}
              instanceId={instance.id}
              instanceNumber={instanceNumber}
            />,
          );
        }
      });
    } else if (adguardData && adguardCardStats) {
      // Single instance - legacy behavior
      softwareTiles.push(
        <AdGuardCard
          key="adguard"
          name={"AdGuard Home"}
          status={mapServiceStatus(adguardData.health.status)}
          stats={adguardCardStats}
        />,
      );
    }
  }

  // Tor - support multiple instances
  if (isServiceEnabled("tor")) {
    const torInstances = getInstances("tor");

    if (torInstances.length > 1) {
      // Multiple instances - render each one
      torInstances.forEach((instance) => {
        const instanceNumber = parseInt(instance.id.split("_")[1]) || undefined;
        // For now, use the first tor data if available
        if (torData && torCardStats) {
          softwareTiles.push(
            <TorCard
              key={instance.id}
              name={torCardStats.nickname || "Tor Relay"}
              status={torCardStats.running ? "online" : "offline"}
              stats={torCardStats}
              ip={torIp}
              port={torPortValue}
              instanceId={instance.id}
              instanceNumber={instanceNumber}
            />,
          );
        }
      });
    } else if (torData && torCardStats) {
      // Single instance - legacy behavior
      softwareTiles.push(
        <TorCard
          key="tor"
          name={torCardStats.nickname || "Tor Relay"}
          status={torCardStats.running ? "online" : "offline"}
          stats={torCardStats}
          ip={torIp}
          port={torPortValue}
        />,
      );
    }
  }
  
  // Bitcoin - support multiple instances
  if (isServiceEnabled("bitcoin")) {
    const bitcoinInstances = getInstances("bitcoin");

    if (bitcoinInstances.length > 1) {
      // Multiple instances - render each one
      bitcoinInstances.forEach((instance) => {
        const instanceNumber = parseInt(instance.id.split("_")[1]) || undefined;
        softwareTiles.push(
          <BitcoinCard
            key={instance.id}
            instanceId={instance.id}
            instanceNumber={instanceNumber}
          />,
        );
      });
    } else {
      // Single instance - legacy behavior
      softwareTiles.push(<BitcoinCard key="bitcoin" />);
    }
  }
  
  // qBittorrent - support multiple instances
  if (isServiceEnabled("qbittorrent")) {
    const qbInstances = getInstances("qbittorrent");

    if (qbInstances.length > 1) {
      // Multiple instances - render each one
      qbInstances.forEach((instance) => {
        const instanceNumber = parseInt(instance.id.split("_")[1]) || undefined;
        softwareTiles.push(
          <QBittorrentCard
            key={instance.id}
            instanceId={instance.id}
            instanceNumber={instanceNumber}
          />,
        );
      });
    } else {
      // Single instance - legacy behavior
      softwareTiles.push(<QBittorrentCard key="qbittorrent" />);
    }
  }

  // Stack IPFS and Homebridge vertically so they occupy the same column similar to Nostr/Alby
  // Only show if either service is enabled
  const ipfsEnabled = isServiceEnabled("ipfs");
  const homebridgeEnabled = isServiceEnabled("homebridge");

  if (ipfsEnabled && homebridgeEnabled) {
    softwareTiles.push(
      <div key="ipfs-homebridge-stacked" className="h-full flex flex-col gap-4">
        <div className="flex-1 min-h-0">
          <IpfsCard />
        </div>
        <div className="flex-1 min-h-0">
          <HomebridgeCard />
        </div>
      </div>,
    );
  } else if (ipfsEnabled) {
    softwareTiles.push(<IpfsCard key="ipfs" />);
  } else if (homebridgeEnabled) {
    softwareTiles.push(<HomebridgeCard key="homebridge" />);
  }

  // Nostrcheck / local Nostr relay tile - use the frontend config exposed by the backend
  const nostrCfg: FrontendConfig["services"]["nostrcheck"] | undefined =
    frontendCfg?.services?.nostrcheck;
  const nostrStatus =
    nostrCfg && nostrCfg.configured
      ? ("online" as const)
      : ("offline" as const);

  // Stack Nostrcheck and AlbyHub vertically so the combined tile matches other card heights
  // Only show if either service is enabled
  const nostrEnabled = isServiceEnabled("nostrcheck");
  const albyEnabled = isServiceEnabled("albyhub");

  if (nostrEnabled && albyEnabled) {
    softwareTiles.push(
      <div key="nostr-alby-stacked" className="h-full flex flex-col gap-4">
        <div className="flex-1 min-h-0">
          <NostrcheckCard
            name={"Nostr Relay"}
            status={nostrStatus}
            url={nostrCfg?.relayUrl}
          />
        </div>
        <div className="flex-1 min-h-0">
          <AlbyHubCard />
        </div>
      </div>,
    );
  } else if (nostrEnabled) {
    softwareTiles.push(
      <NostrcheckCard
        key="nostrcheck"
        name={"Nostr Relay"}
        status={nostrStatus}
        url={nostrCfg?.relayUrl}
      />,
    );
  } else if (albyEnabled) {
    softwareTiles.push(<AlbyHubCard key="albyhub" />);
  }

  const hardwareTiles: React.ReactElement[] = [];

  if (isServiceEnabled("synology")) {
    hardwareTiles.push(<SynologyCard key="synology" />);
  }

  // Stack Roon and Philips Bridge vertically like Nostr/AlbyHub
  const roonEnabled = isServiceEnabled("roon");
  const philipsEnabled = isServiceEnabled("philips");

  if (roonEnabled && philipsEnabled) {
    hardwareTiles.push(
      <div key="roon-philips-stacked" className="h-full flex flex-col gap-4">
        <div className="flex-[1.5] min-h-0">
          <RoonCard />
        </div>
        <div className="flex-1 min-h-0">
          <PhilipsBridgeCard />
        </div>
      </div>,
    );
  } else if (roonEnabled) {
    hardwareTiles.push(<RoonCard key="roon" />);
  } else if (philipsEnabled) {
    hardwareTiles.push(<PhilipsBridgeCard key="philips" />);
  }

  if (isServiceEnabled("macmini")) {
    hardwareTiles.push(<MacMiniCard key="macmini" />);
  }
  if (isServiceEnabled("raspi")) {
    hardwareTiles.push(<RaspberryPiCard key="raspberrypi" />);
  }

  // Router hardware tiles: Beryl and Telenet (if configured in backend services/health)
  if (isServiceEnabled("beryl")) {
    hardwareTiles.push(
      <RouterCard key="beryl" name={"Beryl AX"} serviceKey={"beryl"} />,
    );
  }
  if (isServiceEnabled("telenet")) {
    hardwareTiles.push(
      <RouterCard key="telenet" name={"Telenet"} serviceKey={"telenet"} />,
    );
  }

  const softwareRows = chunk(softwareTiles, 3);
  const hardwareRows = chunk(hardwareTiles, 3);

  // Compute overview counts: prefer the backend services health endpoint. If not available,
  // fall back to the actual tiles we render so the total matches visible tiles.
  if (servicesHealthQuery.data && servicesHealthQuery.data.services) {
    type ServiceMap = Record<string, Partial<ServiceHealth>>;
    const svcObj = servicesHealthQuery.data.services as unknown as ServiceMap;
    const statuses = Object.values(svcObj).map((s) => {
      const st = s && s.status ? String(s.status) : "offline";
      if (st === "error") return "warning";
      if (st === "not_configured") return "offline";
      return st as "online" | "offline" | "warning";
    });

    totalServices = statuses.length;
    onlineCount = statuses.filter((s) => s === "online").length;
    offlineCount = statuses.filter((s) => s === "offline").length;
    warningCount = statuses.filter((s) => s === "warning").length;
  } else {
    // fallback: count actual enabled services (not tiles, since some tiles stack multiple services)
    // Build a comprehensive status list for all enabled services
    const allServiceStatuses: Array<
      "online" | "offline" | "warning" | "loading"
    > = [];

    if (adguardEnabled)
      allServiceStatuses.push(mapServiceStatus(adguardData?.health?.status));
    if (isServiceEnabled("tor"))
      allServiceStatuses.push(
        torData?.torStats?.running ? "online" : torData ? "offline" : "loading",
      );
    if (isServiceEnabled("bitcoin"))
      allServiceStatuses.push(mapServiceStatus(bitcoinHealth?.status));
    if (isServiceEnabled("qbittorrent"))
      allServiceStatuses.push(mapServiceStatus(qbittorrentHealth?.status));
    if (isServiceEnabled("ipfs"))
      allServiceStatuses.push(mapServiceStatus(ipfsHealth?.status));
    if (isServiceEnabled("synology"))
      allServiceStatuses.push(mapServiceStatus(synologyHealth?.status));
    if (isServiceEnabled("roon"))
      allServiceStatuses.push(
        roonHealth?.status === "error"
          ? "warning"
          : mapServiceStatus(roonHealth?.status),
      );
    if (isServiceEnabled("philips")) allServiceStatuses.push("loading"); // PhilipsBridgeCard manages its own query
    if (isServiceEnabled("homebridge")) allServiceStatuses.push("loading"); // HomebridgeCard manages its own query
    if (isServiceEnabled("albyhub")) allServiceStatuses.push("loading"); // AlbyHubCard manages its own query
    if (isServiceEnabled("macmini")) allServiceStatuses.push("loading"); // MacMiniCard manages its own query
    if (isServiceEnabled("beryl")) allServiceStatuses.push("loading"); // RouterCard manages its own query
    if (isServiceEnabled("telenet")) allServiceStatuses.push("loading"); // RouterCard manages its own query
    if (isServiceEnabled("raspi")) allServiceStatuses.push("loading"); // RaspberryPiCard manages its own query
    if (isServiceEnabled("nostrcheck")) allServiceStatuses.push(nostrStatus);

    totalServices = allServiceStatuses.length;
    onlineCount = allServiceStatuses.filter((s) => s === "online").length;
    offlineCount = allServiceStatuses.filter((s) => s === "offline").length;
    warningCount = allServiceStatuses.filter((s) => s === "warning").length;
  }

  const overviewCards: React.ReactElement[] = [
    <Card key="services-online">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Services Online</CardTitle>
        <CheckCircle className="h-4 w-4 text-green-500" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-green-600">
          {onlineCount}/{totalServices}
        </div>
        <p className="text-xs text-muted-foreground">
          {offlineCount > 0 && `${offlineCount} offline`}
          {warningCount > 0 &&
            `${offlineCount > 0 ? ", " : ""}${warningCount} warning`}
        </p>
      </CardContent>
    </Card>,
    <Card key="system-health">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">System Health</CardTitle>
        <Server className="h-4 w-4 text-blue-500" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-blue-600">
          {onlineCount === totalServices
            ? "Excellent"
            : onlineCount >= totalServices * 0.7
              ? "Good"
              : onlineCount > 0
                ? "Degraded"
                : "Critical"}
        </div>
        <p className="text-xs text-muted-foreground">
          Updated {timeSinceUpdate}s ago
        </p>
      </CardContent>
    </Card>,
  ];

  if (adguardEnabled) {
    overviewCards.push(
      <Card key="top-blocked-domain">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Top Blocked Domain
          </CardTitle>
          <Shield className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-lg font-bold text-red-600 truncate">
            {adguardCardStats?.topBlockedDomain !== "N/A"
              ? adguardCardStats?.topBlockedDomain
              : "None"}
          </div>
          <p className="text-xs text-muted-foreground">
            {totalBlocked.toLocaleString()} blocked today
          </p>
        </CardContent>
      </Card>,
      <Card key="network-activity">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Network Activity
          </CardTitle>
          <Activity className="h-4 w-4 text-purple-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-purple-600">
            {totalQueries > 0 ? `${(totalQueries / 1000).toFixed(1)}K` : "0"}
          </div>
          <p className="text-xs text-muted-foreground">
            {totalQueries > 0
              ? `${((totalBlocked / totalQueries) * 100).toFixed(1)}% blocked`
              : "No queries"}
          </p>
        </CardContent>
      </Card>,
    );
  }

  const overviewGridCols =
    overviewCards.length >= 4
      ? "md:grid-cols-2 lg:grid-cols-4"
      : overviewCards.length === 3
        ? "md:grid-cols-2 lg:grid-cols-3"
        : "md:grid-cols-2";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Live Dashboard</h2>
        <Button
          onClick={handleRefresh}
          disabled={isRefreshing}
          variant="outline"
          size="sm"
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
          />
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {/* Overview Stats */}
      <div className={`grid grid-cols-1 gap-4 ${overviewGridCols}`}>
        {overviewCards}
      </div>

      {/* Service Tiles */}
      {/* Software Section: core software services */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Software</h3>
        </div>
        <div className="mt-3 space-y-4">
          {softwareRows.map((row, idx) => (
            <div
              key={`software-row-${idx}`}
              className={`flex flex-col sm:flex-row gap-6 items-stretch ${
                row.length < 3 ? "justify-center" : ""
              }`}
            >
              {row.map((tile, i) => (
                <div key={`software-${idx}-${i}`} className="flex-1 min-w-0">
                  {tile}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Hardware Section: physical devices and appliances */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Hardware</h3>
        </div>
        <div className="mt-3 space-y-4">
          {hardwareRows.map((row, idx) => (
            <div
              key={`hardware-row-${idx}`}
              className={`flex flex-col sm:flex-row gap-6 items-stretch ${
                row.length < 3 ? "justify-center" : ""
              }`}
            >
              {row.map((tile, i) => (
                <div key={`hardware-${idx}-${i}`} className="flex-1 min-w-0">
                  {tile}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
