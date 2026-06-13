import { describe, it, expect } from "vitest";
import {
  parseGatewayIp,
  createNetworkDetector,
  signatureKey,
  signaturesEqual,
  type GatewayRunner,
} from "./gatewayDetect.js";
import type { ArpLookup } from "./arpLookup.js";

const LINUX_ROUTE = `default via 192.168.1.1 dev eth0 proto dhcp metric 100`;

const DARWIN_ROUTE = `   route to: default
destination: default
       mask: default
    gateway: 10.0.0.1
  interface: en0
      flags: <UP,GATEWAY,DONE,STATIC,PRCLONING,GLOBAL>`;

const NETSTAT_FALLBACK = `Routing tables

Internet:
Destination        Gateway            Flags        Netif Expire
default            172.16.0.1         UGScg          en0`;

function fakeArp(mac: string | null): ArpLookup {
  return {
    async lookup({ serviceIp }) {
      return {
        hosts: serviceIp ? [{ ip: serviceIp, mac, iface: "en0" }] : [],
        lanHosts: [],
        note: "",
      };
    },
  };
}

function runnerReturning(output: string): GatewayRunner {
  return { run: async () => output };
}

describe("parseGatewayIp", () => {
  it("parses linux `ip route show default`", () => {
    expect(parseGatewayIp("linux", LINUX_ROUTE)).toBe("192.168.1.1");
  });

  it("parses macOS `route -n get default`", () => {
    expect(parseGatewayIp("darwin", DARWIN_ROUTE)).toBe("10.0.0.1");
  });

  it("falls back to netstat-style default line", () => {
    expect(parseGatewayIp("darwin", NETSTAT_FALLBACK)).toBe("172.16.0.1");
  });

  it("returns undefined when no default route is present", () => {
    expect(parseGatewayIp("linux", "")).toBeUndefined();
    expect(parseGatewayIp("darwin", "no default here")).toBeUndefined();
  });
});

describe("createNetworkDetector", () => {
  it("resolves the gateway MAC via ARP and builds a signature", async () => {
    const detector = createNetworkDetector({
      arp: fakeArp("AA:BB:CC:DD:EE:FF"),
      gatewayRunner: runnerReturning(LINUX_ROUTE),
      platform: "linux",
      interfaces: () => ({
        eth0: [
          {
            address: "192.168.1.50",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "11:22:33:44:55:66",
            internal: false,
            cidr: "192.168.1.50/24",
          },
        ],
      }),
    });
    const sig = await detector.detect();
    expect(sig.gatewayIp).toBe("192.168.1.1");
    expect(sig.gatewayMac).toBe("aa:bb:cc:dd:ee:ff");
    expect(sig.subnet).toBe("192.168.1.50/24");
  });

  it("returns an ip/subnet-only signature when ARP yields no MAC", async () => {
    const detector = createNetworkDetector({
      arp: fakeArp(null),
      gatewayRunner: runnerReturning(DARWIN_ROUTE),
      platform: "darwin",
      interfaces: () => ({}),
    });
    const sig = await detector.detect();
    expect(sig.gatewayIp).toBe("10.0.0.1");
    expect(sig.gatewayMac).toBeUndefined();
    expect(sig.subnet).toBe("10.0.0.0/24");
  });

  it("returns an empty signature when no gateway is found", async () => {
    const detector = createNetworkDetector({
      arp: fakeArp("aa:bb:cc:dd:ee:ff"),
      gatewayRunner: runnerReturning(""),
      platform: "linux",
    });
    expect(await detector.detect()).toEqual({});
  });
});

describe("signature equality", () => {
  it("keys by MAC first, then ip, then subnet", () => {
    expect(signatureKey({ gatewayMac: "AA", gatewayIp: "1.1.1.1" })).toBe("aa");
    expect(signatureKey({ gatewayIp: "1.1.1.1" })).toBe("1.1.1.1");
    expect(signatureKey(undefined)).toBe("");
  });

  it("treats same-MAC signatures as equal regardless of IP", () => {
    expect(
      signaturesEqual(
        { gatewayMac: "aa:bb", gatewayIp: "192.168.1.1" },
        { gatewayMac: "aa:bb", gatewayIp: "192.168.1.9" }
      )
    ).toBe(true);
    expect(
      signaturesEqual({ gatewayMac: "aa:bb" }, { gatewayMac: "cc:dd" })
    ).toBe(false);
  });
});
