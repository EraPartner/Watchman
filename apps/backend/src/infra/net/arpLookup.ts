import { spawn } from 'node:child_process';

export interface ArpHost {
  ip: string;
  mac: string | null;
  iface: string | null;
}

export interface ArpLookupRequest {
  serviceIp?: string;
  platform?: NodeJS.Platform;
}

export interface ArpLookupResult {
  hosts: readonly ArpHost[];
  lanHosts: readonly ArpHost[];
  note: string;
}

export interface ArpLookup {
  lookup(req: ArpLookupRequest): Promise<ArpLookupResult>;
}

export interface NeighborRunner {
  run(platform: NodeJS.Platform, timeoutMs: number): Promise<string>;
}

export const defaultNeighborRunner: NeighborRunner = {
  run(platform, timeoutMs) {
    const { cmd, args } = getNeighborCommand(platform);
    return new Promise((resolve) => {
      const child = spawn(cmd, args, { timeout: timeoutMs });
      let stdout = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.on('close', () => resolve(stdout));
      child.on('error', () => resolve(''));
    });
  },
};

export interface ArpLookupDeps {
  runner: NeighborRunner;
  timeoutMs?: number;
}

export function createArpLookup(deps: ArpLookupDeps): ArpLookup {
  const timeoutMs = deps.timeoutMs ?? 5_000;
  return {
    async lookup({ serviceIp, platform = process.platform }) {
      const raw = await deps.runner.run(platform, timeoutMs);
      const hosts = parseNeighborOutput(platform, raw);
      const lanHosts = filterLanHosts(hosts, serviceIp);
      return {
        hosts,
        lanHosts,
        note: buildLanFilterNote(serviceIp, lanHosts.length),
      };
    },
  };
}

function getNeighborCommand(platform: NodeJS.Platform): { cmd: string; args: string[] } {
  return platform === 'linux'
    ? { cmd: 'ip', args: ['neigh'] }
    : { cmd: 'arp', args: ['-a'] };
}

export function isUnicast(ip: string | undefined | null): boolean {
  if (!ip) return false;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return false;
  const [a, b] = parts as [number, number, number, number];
  if (a >= 224 && a <= 239) return false;
  if (a === 169 && b === 254) return false;
  return true;
}

export function parseNeighborOutput(platform: NodeJS.Platform, output: string): ArpHost[] {
  const hostsMap = new Map<string, ArpHost>();
  if (platform === 'linux') parseLinuxOutput(output, hostsMap);
  else parseBsdOutput(output, hostsMap);
  return Array.from(hostsMap.values());
}

function parseLinuxOutput(output: string, hostsMap: Map<string, ArpHost>): void {
  const lines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/\b(INCOMPLETE|FAILED)\b/i.test(line)) continue;
    const match = line.match(
      /^(\d+\.\d+\.\d+\.\d+)\s+dev\s+(\S+)(?:.*lladdr\s+([0-9a-f:]{5,}))?(?:.*\b(REACHABLE|STALE|DELAY|PERMANENT)\b)?/i,
    );
    if (!match || !match[1]) continue;
    const ip = match[1];
    if (!hostsMap.has(ip)) {
      hostsMap.set(ip, { ip, iface: match[2] ?? null, mac: match[3] ?? null });
    }
  }
}

function parseBsdOutput(output: string, hostsMap: Map<string, ArpHost>): void {
  const lines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/incomplete/i.test(line)) continue;
    const primary = line.match(
      /\(?([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)\)?\s+at\s+([0-9a-f:]{5,})\s+on\s+(\S+)/i,
    );
    if (primary && primary[1]) {
      const ip = primary[1];
      if (!hostsMap.has(ip)) {
        hostsMap.set(ip, { ip, mac: primary[2] ?? null, iface: primary[3] ?? null });
      }
      continue;
    }
    const fallback = line.match(/\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-f:]{5,})/i);
    if (fallback && fallback[1]) {
      const ip = fallback[1];
      if (!hostsMap.has(ip)) {
        hostsMap.set(ip, { ip, mac: fallback[2] ?? null, iface: null });
      }
    }
  }
}

export function filterLanHosts(hosts: readonly ArpHost[], serviceIp: string | undefined): ArpHost[] {
  if (!serviceIp) return [];
  const serviceEntry = hosts.find((h) => h.ip === serviceIp);
  if (serviceEntry?.iface) {
    return hosts.filter((h) => h.iface === serviceEntry.iface && isUnicast(h.ip));
  }
  const octets = serviceIp.split('.');
  if (octets.length !== 4) return [];
  const prefix24 = `${octets[0]}.${octets[1]}.${octets[2]}.`;
  const lan24 = hosts.filter((h) => h.ip.startsWith(prefix24) && isUnicast(h.ip));
  if (lan24.length > 0) return lan24;
  const prefix16 = `${octets[0]}.${octets[1]}.`;
  return hosts.filter((h) => h.ip.startsWith(prefix16) && isUnicast(h.ip));
}

function buildLanFilterNote(serviceIp: string | undefined, lanHostCount: number): string {
  if (!serviceIp) return 'No service host provided';
  return lanHostCount > 0
    ? `Filtered by iface or prefix for ${serviceIp}`
    : `No LAN hosts matched for ${serviceIp}`;
}
