import React, { useState } from "react";
import { AdGuardCard } from "./AdGuardCard";
import { TorCard } from "./TorCard";
import { AdGuardServerStats, TorServerStats } from "../types/server";
import type { FrontendConfig } from "../services/ApiClient";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Activity, CheckCircle, RefreshCw, Server, Shield } from "lucide-react";
import { Button } from "./ui/button";
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
import {
  appendInstanceTiles,
  buildAdguardCardStats,
  buildTorCardStats,
  chunkTiles,
  getTorConnectionInfo,
} from "./dashboard/dashboardData";
import { DashboardTileSection } from "./dashboard/DashboardTileSection";
import {
  deriveCountsFromEnabledServices,
  deriveCountsFromServicesHealth,
  mapServiceStatus,
} from "./dashboard/dashboardStatus";
import { useDashboardQueries } from "./dashboard/useDashboardQueries";

export const LiveServerDashboard = () => {
  const { isServiceEnabled } = useEnabledServices();
  const { getInstances } = useServiceInstances();
  const adguardEnabled = isServiceEnabled("adguard");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    adguardQuery,
    torQuery,
    frontendConfigQuery,
    bitcoinQuery,
    qbittorrentQuery,
    ipfsQuery,
    synologyQuery,
    roonQuery,
    servicesHealthQuery,
    refreshEnabledQueries,
  } = useDashboardQueries({
    adguardEnabled,
    isServiceEnabled,
  });

  const lastUpdateTime = new Date();

  // derive adguard/tor/other statuses from queries
  const adguardData = adguardQuery.data;
  const torData = torQuery.data;
  const frontendCfg = frontendConfigQuery.data as FrontendConfig | undefined;
  const bitcoinHealth = bitcoinQuery.data;
  const qbittorrentHealth = qbittorrentQuery.data;
  const ipfsHealth = ipfsQuery.data;
  const synologyHealth = synologyQuery.data;
  const roonHealth = roonQuery.data;

  let totalServices = 0;
  let onlineCount = 0;
  let offlineCount = 0;
  let warningCount = 0;

  const totalQueries =
    (adguardData?.stats as AdGuardServerStats | undefined)?.totalQueries ?? 0;
  const totalBlocked =
    (adguardData?.stats as AdGuardServerStats | undefined)?.blockedQueries ?? 0;

  const adguardCardStats: AdGuardServerStats | undefined =
    buildAdguardCardStats(adguardData?.stats);

  const torCardStats: TorServerStats | undefined = buildTorCardStats(torData);

  const timeSinceUpdate = Math.floor(
    (Date.now() - lastUpdateTime.getTime()) / 1000
  );

  // Refresh helper - refetch all enabled queries
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshEnabledQueries();
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
  const { torIp, torPortValue } = getTorConnectionInfo(
    frontendCfg,
    torCardStats
  );

  // Build arrays of tile elements so we can chunk and render rows exactly 3 per row
  const softwareTiles: React.ReactElement[] = [];

  // AdGuard - support multiple instances
  if (isServiceEnabled("adguard")) {
    const adguardInstances = getInstances("adguard");

    appendInstanceTiles({
      tiles: softwareTiles,
      instances: adguardInstances,
      createInstanceTile: (instanceId, instanceNumber) => {
        if (!adguardData || !adguardCardStats) {
          return null;
        }

        return (
          <AdGuardCard
            key={instanceId}
            name={"AdGuard Home"}
            status={mapServiceStatus(adguardData.health.status)}
            stats={adguardCardStats}
            instanceId={instanceId}
            instanceNumber={instanceNumber}
          />
        );
      },
      createSingleTile: () => {
        if (!adguardData || !adguardCardStats) {
          return null;
        }

        return (
          <AdGuardCard
            key="adguard"
            name={"AdGuard Home"}
            status={mapServiceStatus(adguardData.health.status)}
            stats={adguardCardStats}
          />
        );
      },
    });
  }

  // Tor - support multiple instances
  if (isServiceEnabled("tor")) {
    const torInstances = getInstances("tor");

    appendInstanceTiles({
      tiles: softwareTiles,
      instances: torInstances,
      createInstanceTile: (instanceId, instanceNumber) => {
        if (!torData || !torCardStats) {
          return null;
        }

        return (
          <TorCard
            key={instanceId}
            name={torCardStats.nickname || "Tor Relay"}
            status={torCardStats.running ? "online" : "offline"}
            stats={torCardStats}
            ip={torIp}
            port={torPortValue}
            instanceId={instanceId}
            instanceNumber={instanceNumber}
          />
        );
      },
      createSingleTile: () => {
        if (!torData || !torCardStats) {
          return null;
        }

        return (
          <TorCard
            key="tor"
            name={torCardStats.nickname || "Tor Relay"}
            status={torCardStats.running ? "online" : "offline"}
            stats={torCardStats}
            ip={torIp}
            port={torPortValue}
          />
        );
      },
    });
  }

  // Bitcoin - support multiple instances
  if (isServiceEnabled("bitcoin")) {
    const bitcoinInstances = getInstances("bitcoin");

    appendInstanceTiles({
      tiles: softwareTiles,
      instances: bitcoinInstances,
      createInstanceTile: (instanceId, instanceNumber) => (
        <BitcoinCard
          key={instanceId}
          instanceId={instanceId}
          instanceNumber={instanceNumber}
        />
      ),
      createSingleTile: () => <BitcoinCard key="bitcoin" />,
    });
  }

  // qBittorrent - support multiple instances
  if (isServiceEnabled("qbittorrent")) {
    const qbInstances = getInstances("qbittorrent");

    appendInstanceTiles({
      tiles: softwareTiles,
      instances: qbInstances,
      createInstanceTile: (instanceId, instanceNumber) => (
        <QBittorrentCard
          key={instanceId}
          instanceId={instanceId}
          instanceNumber={instanceNumber}
        />
      ),
      createSingleTile: () => <QBittorrentCard key="qbittorrent" />,
    });
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
      </div>
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
      </div>
    );
  } else if (nostrEnabled) {
    softwareTiles.push(
      <NostrcheckCard
        key="nostrcheck"
        name={"Nostr Relay"}
        status={nostrStatus}
        url={nostrCfg?.relayUrl}
      />
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
      </div>
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
      <RouterCard key="beryl" name={"Beryl AX"} serviceKey={"beryl"} />
    );
  }
  if (isServiceEnabled("telenet")) {
    hardwareTiles.push(
      <RouterCard key="telenet" name={"Telenet"} serviceKey={"telenet"} />
    );
  }

  const softwareRows = chunkTiles(softwareTiles, 3);
  const hardwareRows = chunkTiles(hardwareTiles, 3);

  // Compute overview counts: prefer the backend services health endpoint. If not available,
  // fall back to the actual tiles we render so the total matches visible tiles.
  if (servicesHealthQuery.data && servicesHealthQuery.data.services) {
    const counts = deriveCountsFromServicesHealth(
      servicesHealthQuery.data.services
    );
    totalServices = counts.total;
    onlineCount = counts.online;
    offlineCount = counts.offline;
    warningCount = counts.warning;
  } else {
    const counts = deriveCountsFromEnabledServices({
      adguardEnabled,
      adguardStatus: adguardData?.health?.status,
      isServiceEnabled,
      torRunning: Boolean(torData?.running),
      torLoaded: Boolean(torData),
      bitcoinStatus: bitcoinHealth?.status,
      qbittorrentStatus: qbittorrentHealth?.status,
      ipfsStatus: ipfsHealth?.status,
      synologyStatus: synologyHealth?.status,
      roonStatus: roonHealth?.status,
      nostrStatus,
    });

    totalServices = counts.total;
    onlineCount = counts.online;
    offlineCount = counts.offline;
    warningCount = counts.warning;
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
      </Card>
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
      <DashboardTileSection
        title="Software"
        rows={softwareRows}
        rowPrefix="software"
      />

      {/* Hardware Section: physical devices and appliances */}
      <DashboardTileSection
        title="Hardware"
        rows={hardwareRows}
        rowPrefix="hardware"
      />
    </div>
  );
};
