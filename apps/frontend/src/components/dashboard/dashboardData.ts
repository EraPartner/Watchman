import type { AdGuardServerStats, TorServerStats } from "@/types/server";
import type { ReactElement } from "react";

export interface TorConnectionOverride {
  torIp?: string;
  torPort?: number;
}

export interface DashboardServiceInstance {
  id: string;
}

export type TorRaw = {
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

export function buildAdguardCardStats(
  adguardStats: Partial<AdGuardServerStats> | undefined
): AdGuardServerStats | undefined {
  if (!adguardStats) {
    return undefined;
  }

  return {
    totalQueries: adguardStats.totalQueries ?? 0,
    blockedQueries: adguardStats.blockedQueries ?? 0,
    allowedQueries: adguardStats.allowedQueries ?? 0,
    blockingRate: adguardStats.blockingRate ?? 0,
    protectionEnabled: adguardStats.protectionEnabled ?? false,
    version: adguardStats.version ?? "Unknown",
    topBlockedDomain: adguardStats.topBlockedDomain ?? "N/A",
    topQueriedDomain: adguardStats.topQueriedDomain ?? "N/A",
    avgProcessingTime: adguardStats.avgProcessingTime ?? 0,
    running: adguardStats.running ?? false,
    timeUnits: adguardStats.timeUnits,
    topClient: adguardStats.topClient ?? "N/A",
    safebrowsingBlocked: adguardStats.safebrowsingBlocked ?? 0,
    safesearchBlocked: adguardStats.safesearchBlocked ?? 0,
    parentalBlocked: adguardStats.parentalBlocked ?? 0,
  };
}

export function buildTorCardStats(
  torRaw: Partial<TorRaw> | undefined
): TorServerStats | undefined {
  if (!torRaw) {
    return undefined;
  }

  return {
    version: torRaw.version ?? "Unknown",
    nickname: torRaw.nickname ?? undefined,
    fingerprint: torRaw.fingerprint ?? "Unknown",
    relayType: (torRaw.relayType || "relay") as TorServerStats["relayType"],
    bandwidth: {
      current: (torRaw.bandwidth && torRaw.bandwidth.current) ?? 0,
      average: (torRaw.bandwidth && torRaw.bandwidth.average) ?? 0,
      burst: (torRaw.bandwidth && torRaw.bandwidth.burst) ?? 0,
      observed: (torRaw.bandwidth && torRaw.bandwidth.observed) ?? undefined,
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
  };
}

export function getTorConnectionInfo(
  override: TorConnectionOverride | undefined,
  torCardStats: TorServerStats | undefined
) {
  return {
    torIp: override?.torIp ?? undefined,
    torPortValue: override?.torPort ?? torCardStats?.orPort ?? undefined,
  };
}

export function chunkTiles<T>(tiles: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < tiles.length; index += size) {
    rows.push(tiles.slice(index, index + size));
  }
  return rows;
}

export function getInstanceNumber(instanceId: string): number | undefined {
  const suffix = instanceId.split("_")[1];
  if (!suffix) {
    return undefined;
  }

  const parsed = Number.parseInt(suffix, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

interface AppendInstanceTilesParams {
  tiles: ReactElement[];
  instances: DashboardServiceInstance[];
  createInstanceTile: (
    instanceId: string,
    instanceNumber?: number
  ) => ReactElement | null;
  createSingleTile: () => ReactElement | null;
}

export function appendInstanceTiles({
  tiles,
  instances,
  createInstanceTile,
  createSingleTile,
}: AppendInstanceTilesParams): void {
  if (instances.length > 1) {
    instances.forEach((instance) => {
      const tile = createInstanceTile(
        instance.id,
        getInstanceNumber(instance.id)
      );
      if (tile) {
        tiles.push(tile);
      }
    });
    return;
  }

  const singleTile = createSingleTile();
  if (singleTile) {
    tiles.push(singleTile);
  }
}
