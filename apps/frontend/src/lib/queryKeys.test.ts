import { describe, expect, it } from "vitest";
import { queryKeys } from "./queryKeys";

describe("queryKeys", () => {
  it("returns stable base keys", () => {
    expect(queryKeys.frontendConfig()).toEqual(["frontend", "config"]);
    expect(queryKeys.servicesHealth()).toEqual(["services", "health"]);
    expect(queryKeys.servicesInstances()).toEqual(["services", "instances"]);
    expect(queryKeys.metrics()).toEqual(["metrics"]);
  });

  it("builds service keys with default and explicit instance ids", () => {
    expect(queryKeys.servicePrefix("tor")).toEqual(["tor"]);
    expect(queryKeys.serviceStatus("tor")).toEqual(["tor", "status", "tor"]);
    expect(queryKeys.serviceStatus("tor", "tor_2")).toEqual([
      "tor",
      "status",
      "tor_2",
    ]);
    expect(queryKeys.serviceStats("tor")).toEqual(["tor", "stats", "tor"]);
    expect(queryKeys.serviceStats("tor", "tor_2")).toEqual([
      "tor",
      "stats",
      "tor_2",
    ]);
  });

  it("returns service-specific keys", () => {
    expect(queryKeys.adguardFull()).toEqual(["adguard", "full"]);
    expect(queryKeys.torRelay()).toEqual(["tor", "relay"]);
    expect(queryKeys.serviceUpdates("bitcoin")).toEqual(["bitcoin", "updates"]);
    expect(queryKeys.routerArp("router-main")).toEqual([
      "router",
      "arp",
      "router-main",
    ]);
  });

  it("uses homebridge defaults and custom instance ids", () => {
    expect(queryKeys.homebridgeServerInformation()).toEqual([
      "homebridge",
      "server-information",
      "homebridge",
    ]);
    expect(queryKeys.homebridgeVersion()).toEqual([
      "homebridge",
      "homebridge-version",
      "homebridge",
    ]);
    expect(queryKeys.homebridgeAccessories()).toEqual([
      "homebridge",
      "accessories",
      "homebridge",
    ]);

    expect(queryKeys.homebridgeServerInformation("hb_2")).toEqual([
      "homebridge",
      "server-information",
      "hb_2",
    ]);
    expect(queryKeys.homebridgeVersion("hb_2")).toEqual([
      "homebridge",
      "homebridge-version",
      "hb_2",
    ]);
    expect(queryKeys.homebridgeAccessories("hb_2")).toEqual([
      "homebridge",
      "accessories",
      "hb_2",
    ]);
  });
});
