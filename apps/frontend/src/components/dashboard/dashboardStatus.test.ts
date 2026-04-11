import { describe, expect, it } from "vitest";
import {
  countStatuses,
  deriveCountsFromEnabledServices,
  deriveCountsFromServicesHealth,
  mapServiceStatus,
} from "./dashboardStatus";

describe("dashboardStatus", () => {
  it("mapServiceStatus maps known and unknown statuses", () => {
    expect(mapServiceStatus("online")).toBe("online");
    expect(mapServiceStatus("warning")).toBe("warning");
    expect(mapServiceStatus("not_configured")).toBe("offline");
    expect(mapServiceStatus("offline")).toBe("offline");
    expect(mapServiceStatus("unexpected")).toBe("offline");
  });

  it("countStatuses counts each dashboard status bucket", () => {
    expect(countStatuses(["online", "offline", "warning", "offline"])).toEqual({
      total: 4,
      online: 1,
      offline: 2,
      warning: 1,
    });
  });

  it("deriveCountsFromServicesHealth converts error to warning and missing to offline", () => {
    const result = deriveCountsFromServicesHealth({
      adguard: { status: "online" },
      tor: { status: "error" },
      bitcoin: {},
      ipfs: { status: "not_configured" },
    });

    expect(result).toEqual({
      total: 4,
      online: 1,
      offline: 2,
      warning: 1,
    });
  });

  it("deriveCountsFromEnabledServices includes enabled service states and loading placeholders", () => {
    const enabled = new Set([
      "tor",
      "bitcoin",
      "qbittorrent",
      "ipfs",
      "synology",
      "roon",
      "philips",
      "homebridge",
      "albyhub",
      "macmini",
      "beryl",
      "telenet",
      "raspi",
      "nostrcheck",
    ]);

    const result = deriveCountsFromEnabledServices({
      adguardEnabled: true,
      adguardStatus: "warning",
      isServiceEnabled: (serviceName) => enabled.has(serviceName),
      torRunning: false,
      torLoaded: false,
      bitcoinStatus: "online",
      qbittorrentStatus: "offline",
      ipfsStatus: "not_configured",
      synologyStatus: "online",
      roonStatus: "error",
      nostrStatus: "warning",
    });

    expect(result).toEqual({
      total: 15,
      online: 2,
      offline: 2,
      warning: 3,
    });
  });
});
