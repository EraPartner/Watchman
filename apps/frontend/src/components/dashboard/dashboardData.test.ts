import { createElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  appendInstanceTiles,
  buildAdguardCardStats,
  buildTorCardStats,
  chunkTiles,
  getInstanceNumber,
  getTorConnectionInfo,
} from "./dashboardData";

describe("dashboardData", () => {
  it("buildAdguardCardStats returns undefined when source is missing", () => {
    expect(buildAdguardCardStats(undefined)).toBeUndefined();
  });

  it("buildAdguardCardStats applies defaults for missing fields", () => {
    const result = buildAdguardCardStats({
      totalQueries: 42,
      protectionEnabled: true,
      timeUnits: "ms",
    });

    expect(result).toEqual({
      totalQueries: 42,
      blockedQueries: 0,
      allowedQueries: 0,
      blockingRate: 0,
      protectionEnabled: true,
      version: "Unknown",
      topBlockedDomain: "N/A",
      topQueriedDomain: "N/A",
      avgProcessingTime: 0,
      running: false,
      timeUnits: "ms",
      topClient: "N/A",
      safebrowsingBlocked: 0,
      safesearchBlocked: 0,
      parentalBlocked: 0,
    });
  });

  it("buildTorCardStats maps values and falls back to legacy field names", () => {
    const result = buildTorCardStats({
      version: "0.4.8",
      nickname: "watchman-relay",
      fingerprint: "ABC123",
      relayType: "exit",
      bandwidth: { current: 100, average: 50 },
      connections: { current: 2, total: 20 },
      circuits: { active: 1, total: 5 },
      flags: ["Fast"],
      consensus_weight: 10,
      exit_policy: "accept *:*",
      hibernating: true,
      or_port: 9001,
      running: true,
      country: "BE",
      city: "Ghent",
      platform: "Linux",
      contact: "ops@example.test",
    });

    expect(result).toEqual({
      version: "0.4.8",
      nickname: "watchman-relay",
      fingerprint: "ABC123",
      relayType: "exit",
      bandwidth: {
        current: 100,
        average: 50,
        burst: 0,
        observed: undefined,
      },
      connections: { current: 2, total: 20 },
      circuits: { active: 1, total: 5 },
      flags: ["Fast"],
      consensusWeight: 10,
      exitPolicy: "accept *:*",
      hibernating: true,
      orPort: 9001,
      controlPort: undefined,
      running: true,
      country: "BE",
      city: "Ghent",
      platform: "Linux",
      contact: "ops@example.test",
    });
  });

  it("getTorConnectionInfo prefers frontend config port over tor stats", () => {
    const result = getTorConnectionInfo(
      { torIp: "10.0.0.5", torPort: 9050 },
      { orPort: 9001 } as never
    );

    expect(result).toEqual({
      torIp: "10.0.0.5",
      torPortValue: 9050,
    });
  });

  it("chunkTiles groups tiles into fixed-size rows", () => {
    expect(chunkTiles([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("getInstanceNumber returns parsed suffix or undefined", () => {
    expect(getInstanceNumber("tor_2")).toBe(2);
    expect(getInstanceNumber("tor_x")).toBeUndefined();
    expect(getInstanceNumber("tor")).toBeUndefined();
  });

  it("appendInstanceTiles appends per-instance tiles and skips null values", () => {
    const tiles: ReactElement[] = [];
    const createInstanceTile = vi
      .fn<
        (instanceId: string, instanceNumber?: number) => ReactElement | null
      >()
      .mockImplementation((instanceId, instanceNumber) =>
        instanceNumber === 2
          ? null
          : createElement("div", { key: `${instanceId}-${instanceNumber}` })
      );
    const createSingleTile = vi.fn<() => ReactElement | null>();

    appendInstanceTiles({
      tiles,
      instances: [{ id: "adguard_1" }, { id: "adguard_2" }],
      createInstanceTile,
      createSingleTile,
    });

    expect(createInstanceTile).toHaveBeenNthCalledWith(1, "adguard_1", 1);
    expect(createInstanceTile).toHaveBeenNthCalledWith(2, "adguard_2", 2);
    expect(createSingleTile).not.toHaveBeenCalled();
    expect(tiles).toHaveLength(1);
  });

  it("appendInstanceTiles appends single tile when only one instance exists", () => {
    const tiles: ReactElement[] = [];
    const singleTile = createElement("div", { key: "single" });
    const createInstanceTile =
      vi.fn<
        (instanceId: string, instanceNumber?: number) => ReactElement | null
      >();
    const createSingleTile = vi
      .fn<() => ReactElement | null>()
      .mockReturnValue(singleTile);

    appendInstanceTiles({
      tiles,
      instances: [{ id: "adguard_1" }],
      createInstanceTile,
      createSingleTile,
    });

    expect(createInstanceTile).not.toHaveBeenCalled();
    expect(createSingleTile).toHaveBeenCalledTimes(1);
    expect(tiles).toEqual([singleTile]);
  });
});
