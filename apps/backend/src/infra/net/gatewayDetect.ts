import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import type { ArpLookup } from "./arpLookup.js";

// The fingerprint that identifies the LAN the backend host is on (ADR-027).
// gatewayMac is the primary identity used for auto-switch matching; gatewayIp
// and subnet are informational / weak fallbacks.
export interface NetworkSignature {
  gatewayMac?: string;
  gatewayIp?: string;
  subnet?: string;
}

export interface NetworkDetector {
  detect(): Promise<NetworkSignature>;
}

// Injectable command runner (mirrors arpLookup's NeighborRunner) so the parser
// and detection logic are unit-testable without shelling out.
export interface GatewayRunner {
  run(platform: NodeJS.Platform, timeoutMs: number): Promise<string>;
}

function getGatewayCommand(platform: NodeJS.Platform): {
  cmd: string;
  args: string[];
} {
  return platform === "linux"
    ? { cmd: "ip", args: ["route", "show", "default"] }
    : { cmd: "route", args: ["-n", "get", "default"] };
}

export const defaultGatewayRunner: GatewayRunner = {
  run(platform, timeoutMs) {
    const { cmd, args } = getGatewayCommand(platform);
    return new Promise((resolve) => {
      const child = spawn(cmd, args, { timeout: timeoutMs });
      let stdout = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.on("close", () => resolve(stdout));
      child.on("error", () => resolve(""));
    });
  },
};

// Linux `ip route show default`: "default via 192.168.1.1 dev eth0 ..."
// macOS/BSD `route -n get default`: a line "    gateway: 192.168.1.1"
export function parseGatewayIp(
  platform: NodeJS.Platform,
  output: string
): string | undefined {
  if (platform === "linux") {
    const m = output.match(/default\s+via\s+(\d+\.\d+\.\d+\.\d+)/i);
    return m?.[1];
  }
  const m = output.match(/gateway:\s*(\d+\.\d+\.\d+\.\d+)/i);
  if (m?.[1]) return m[1];
  // Fallback for `netstat -rn` style output: "default  192.168.1.1  UGScg en0"
  for (const line of output.split(/\r?\n/)) {
    const nm = line.match(/^default\s+(\d+\.\d+\.\d+\.\d+)\s+/i);
    if (nm?.[1]) return nm[1];
  }
  return undefined;
}

type InterfaceReader = () => ReturnType<typeof networkInterfaces>;

// Best-effort subnet for the gateway: prefer the CIDR of a local IPv4 interface
// on the same /24, else the gateway's own /24. Purely a secondary signal.
function subnetForGateway(
  read: InterfaceReader,
  gatewayIp: string
): string | undefined {
  const prefix24 = gatewayIp.split(".").slice(0, 3).join(".");
  const ifaces = read();
  for (const list of Object.values(ifaces)) {
    for (const info of list ?? []) {
      if (info.internal) continue;
      if (String(info.family) !== "IPv4" && String(info.family) !== "4")
        continue;
      if (info.address.startsWith(`${prefix24}.`) && info.cidr) {
        return info.cidr;
      }
    }
  }
  return `${prefix24}.0/24`;
}

export interface NetworkDetectorDeps {
  arp: ArpLookup;
  gatewayRunner?: GatewayRunner;
  platform?: NodeJS.Platform;
  timeoutMs?: number;
  /** Injectable for tests; defaults to os.networkInterfaces. */
  interfaces?: InterfaceReader;
}

export function createNetworkDetector(
  deps: NetworkDetectorDeps
): NetworkDetector {
  const runner = deps.gatewayRunner ?? defaultGatewayRunner;
  const platform = deps.platform ?? process.platform;
  const timeoutMs = deps.timeoutMs ?? 5_000;
  const readInterfaces = deps.interfaces ?? networkInterfaces;

  return {
    async detect(): Promise<NetworkSignature> {
      const raw = await runner.run(platform, timeoutMs);
      const gatewayIp = parseGatewayIp(platform, raw);
      const sig: NetworkSignature = {};
      if (!gatewayIp) return sig;
      sig.gatewayIp = gatewayIp;
      const subnet = subnetForGateway(readInterfaces, gatewayIp);
      if (subnet) sig.subnet = subnet;
      try {
        const { hosts } = await deps.arp.lookup({
          serviceIp: gatewayIp,
          platform,
        });
        const match = hosts.find((h) => h.ip === gatewayIp);
        if (match?.mac) sig.gatewayMac = match.mac.toLowerCase();
      } catch {
        // ARP unavailable — fall back to ip/subnet-only signature.
      }
      return sig;
    },
  };
}

/** Two signatures identify the same LAN when their primary key matches (MAC first). */
export function signatureKey(sig: NetworkSignature | undefined): string {
  if (!sig) return "";
  return (sig.gatewayMac ?? sig.gatewayIp ?? sig.subnet ?? "").toLowerCase();
}

export function signaturesEqual(
  a: NetworkSignature | undefined,
  b: NetworkSignature | undefined
): boolean {
  return signatureKey(a) === signatureKey(b);
}
