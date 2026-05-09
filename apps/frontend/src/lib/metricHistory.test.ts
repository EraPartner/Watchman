import { afterEach, describe, expect, it } from "vitest";
import {
  HISTORY_CAPACITY,
  _resetMetricHistoryForTests,
  getSeries,
  recordStats,
} from "./metricHistory";

describe("metricHistory", () => {
  afterEach(() => {
    _resetMetricHistoryForTests();
  });

  it("appends finite samples and exposes them via getSeries", () => {
    recordStats(
      "bitcoin",
      "main",
      { blocks: 100, connections: 8 },
      ["blocks", "connections"],
      1000
    );
    recordStats(
      "bitcoin",
      "main",
      { blocks: 101, connections: 8 },
      ["blocks", "connections"],
      2000
    );

    expect(getSeries("bitcoin", "main", "blocks").map((s) => s.v)).toEqual([
      100, 101,
    ]);
    expect(
      getSeries("bitcoin", "main", "connections").map((s) => s.v)
    ).toEqual([8, 8]);
  });

  it("dedupes by snapshot timestamp", () => {
    recordStats("ipfs", "main", { peers: 5 }, ["peers"], 1000);
    recordStats("ipfs", "main", { peers: 6 }, ["peers"], 1000);
    expect(getSeries("ipfs", "main", "peers").map((s) => s.v)).toEqual([5]);
  });

  it("ignores non-numeric values silently", () => {
    recordStats(
      "synology",
      "main",
      { name: "tower", load: 25 },
      ["name", "load"],
      1000
    );
    expect(getSeries("synology", "main", "name")).toEqual([]);
    expect(getSeries("synology", "main", "load").map((s) => s.v)).toEqual([25]);
  });

  it("caps series at HISTORY_CAPACITY samples", () => {
    for (let i = 0; i < HISTORY_CAPACITY + 25; i++) {
      recordStats("tor", "main", { bandwidthCurrent: i }, ["bandwidthCurrent"], i);
    }
    const series = getSeries("tor", "main", "bandwidthCurrent");
    expect(series.length).toBe(HISTORY_CAPACITY);
    expect(series[0]!.v).toBe(25);
    expect(series[series.length - 1]!.v).toBe(HISTORY_CAPACITY + 24);
  });

  it("partitions samples per (kind, instance, metric)", () => {
    recordStats("qbittorrent", "qb1", { dlSpeed: 100 }, ["dlSpeed"], 1000);
    recordStats("qbittorrent", "qb2", { dlSpeed: 999 }, ["dlSpeed"], 1000);

    expect(getSeries("qbittorrent", "qb1", "dlSpeed").map((s) => s.v)).toEqual([
      100,
    ]);
    expect(getSeries("qbittorrent", "qb2", "dlSpeed").map((s) => s.v)).toEqual([
      999,
    ]);
  });

  it("dot-path resolves nested metrics", () => {
    recordStats(
      "synology",
      "main",
      { cpu: { usage: 42, temperature: 55 } },
      ["cpu.usage", "cpu.temperature"],
      1000
    );
    expect(getSeries("synology", "main", "cpu.usage").map((s) => s.v)).toEqual([
      42,
    ]);
    expect(
      getSeries("synology", "main", "cpu.temperature").map((s) => s.v)
    ).toEqual([55]);
  });

  it("coerces booleans to 0/1", () => {
    recordStats(
      "philips",
      "main",
      { reachable: true, lightCount: 5 },
      ["reachable", "lightCount"],
      1000
    );
    expect(getSeries("philips", "main", "reachable").map((s) => s.v)).toEqual([
      1,
    ]);
    expect(getSeries("philips", "main", "lightCount").map((s) => s.v)).toEqual([
      5,
    ]);
  });
});
