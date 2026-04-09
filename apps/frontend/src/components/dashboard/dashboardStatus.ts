import type { ServiceHealth } from "@/services/ApiClient";

export type DashboardServiceStatus =
  | "online"
  | "offline"
  | "warning"
  | "loading";

export interface DashboardStatusCounts {
  total: number;
  online: number;
  offline: number;
  warning: number;
}

type DashboardServiceMap = Record<string, Partial<ServiceHealth>>;

export function mapServiceStatus(status?: string): DashboardServiceStatus {
  switch (status) {
    case "online":
      return "online";
    case "warning":
      return "warning";
    case "not_configured":
      return "offline";
    case "offline":
      return "offline";
    default:
      return "offline";
  }
}

export function countStatuses(
  statuses: DashboardServiceStatus[]
): DashboardStatusCounts {
  return {
    total: statuses.length,
    online: statuses.filter((status) => status === "online").length,
    offline: statuses.filter((status) => status === "offline").length,
    warning: statuses.filter((status) => status === "warning").length,
  };
}

export function deriveCountsFromServicesHealth(
  servicesHealth: unknown
): DashboardStatusCounts {
  const serviceMap = servicesHealth as DashboardServiceMap;
  const statuses = Object.values(serviceMap).map((serviceHealth) => {
    const normalized =
      serviceHealth && serviceHealth.status
        ? String(serviceHealth.status)
        : "offline";

    if (normalized === "error") {
      return "warning";
    }

    return mapServiceStatus(normalized);
  });

  return countStatuses(statuses);
}

export function deriveCountsFromEnabledServices({
  adguardEnabled,
  adguardStatus,
  isServiceEnabled,
  torRunning,
  torLoaded,
  bitcoinStatus,
  qbittorrentStatus,
  ipfsStatus,
  synologyStatus,
  roonStatus,
  nostrStatus,
}: {
  adguardEnabled: boolean;
  adguardStatus?: string;
  isServiceEnabled: (serviceName: string) => boolean;
  torRunning: boolean;
  torLoaded: boolean;
  bitcoinStatus?: string;
  qbittorrentStatus?: string;
  ipfsStatus?: string;
  synologyStatus?: string;
  roonStatus?: string;
  nostrStatus: DashboardServiceStatus;
}): DashboardStatusCounts {
  const statuses: DashboardServiceStatus[] = [];

  if (adguardEnabled) {
    statuses.push(mapServiceStatus(adguardStatus));
  }

  if (isServiceEnabled("tor")) {
    statuses.push(torRunning ? "online" : torLoaded ? "offline" : "loading");
  }

  if (isServiceEnabled("bitcoin")) {
    statuses.push(mapServiceStatus(bitcoinStatus));
  }

  if (isServiceEnabled("qbittorrent")) {
    statuses.push(mapServiceStatus(qbittorrentStatus));
  }

  if (isServiceEnabled("ipfs")) {
    statuses.push(mapServiceStatus(ipfsStatus));
  }

  if (isServiceEnabled("synology")) {
    statuses.push(mapServiceStatus(synologyStatus));
  }

  if (isServiceEnabled("roon")) {
    statuses.push(
      roonStatus === "error" ? "warning" : mapServiceStatus(roonStatus)
    );
  }

  if (isServiceEnabled("philips")) {
    statuses.push("loading");
  }

  if (isServiceEnabled("homebridge")) {
    statuses.push("loading");
  }

  if (isServiceEnabled("albyhub")) {
    statuses.push("loading");
  }

  if (isServiceEnabled("macmini")) {
    statuses.push("loading");
  }

  if (isServiceEnabled("beryl")) {
    statuses.push("loading");
  }

  if (isServiceEnabled("telenet")) {
    statuses.push("loading");
  }

  if (isServiceEnabled("raspi")) {
    statuses.push("loading");
  }

  if (isServiceEnabled("nostrcheck")) {
    statuses.push(nostrStatus);
  }

  return countStatuses(statuses);
}
