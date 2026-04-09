import { spawn } from "child_process";

const CACHE_TTL_MS = 3000;
const MAX_CACHE_ENTRIES = 256;
const arpLookupCache = new Map();

function isUnicast(ip) {
  if (!ip || typeof ip !== "string") return false;

  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  if (parts[0] >= 224 && parts[0] <= 239) return false;
  if (parts[0] === 169 && parts[1] === 254) return false;

  return true;
}

function getNeighborCommand(platform) {
  return platform === "linux"
    ? { cmd: "ip", args: ["neigh"] }
    : { cmd: "arp", args: ["-a"] };
}

function buildCacheKey(platform, serviceIp) {
  return `${platform || "unknown"}:${serviceIp || "none"}`;
}

function getCachedResult(cacheKey) {
  const cachedEntry = arpLookupCache.get(cacheKey);
  if (!cachedEntry) return undefined;

  if (Date.now() - cachedEntry.timestamp > CACHE_TTL_MS) {
    arpLookupCache.delete(cacheKey);
    return undefined;
  }

  return cachedEntry.value;
}

function setCachedResult(cacheKey, value) {
  pruneCache();

  arpLookupCache.set(cacheKey, {
    timestamp: Date.now(),
    value,
  });
}

function pruneCache() {
  const now = Date.now();

  for (const [key, entry] of arpLookupCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      arpLookupCache.delete(key);
    }
  }

  while (arpLookupCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = arpLookupCache.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    arpLookupCache.delete(oldestKey);
  }
}

function runNeighborLookup(platform) {
  const { cmd, args } = getNeighborCommand(platform);

  return new Promise((resolve) => {
    const child = spawn(cmd, args, { timeout: 5000 });
    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.on("close", () => resolve(stdout));
    child.on("error", () => resolve(""));
  });
}

function parseLinuxOutput(output, hostsMap) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/\b(INCOMPLETE|FAILED)\b/i.test(line)) continue;

    const match = line.match(
      /^(\d+\.\d+\.\d+\.\d+)\s+dev\s+(\S+)(?:.*lladdr\s+([0-9a-f:]{5,}))?(?:.*\b(REACHABLE|STALE|DELAY|PERMANENT)\b)?/i
    );

    if (!match) continue;

    const ip = match[1];
    const iface = match[2] || null;
    const mac = match[3] || null;

    if (ip && !hostsMap.has(ip)) {
      hostsMap.set(ip, { ip, mac, iface });
    }
  }
}

function parseBsdOutput(output, hostsMap) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/incomplete/i.test(line)) continue;

    const primaryMatch = line.match(
      /\(?([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)\)?\s+at\s+([0-9a-f:]{5,})\s+on\s+(\S+)/i
    );

    if (primaryMatch) {
      const ip = primaryMatch[1];
      const mac = primaryMatch[2] || null;
      const iface = primaryMatch[3] || null;

      if (ip && !hostsMap.has(ip)) {
        hostsMap.set(ip, { ip, mac, iface });
      }
      continue;
    }

    const fallbackMatch = line.match(
      /\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-f:]{5,})/i
    );
    if (fallbackMatch) {
      const ip = fallbackMatch[1];
      const mac = fallbackMatch[2] || null;
      if (ip && !hostsMap.has(ip)) {
        hostsMap.set(ip, { ip, mac, iface: null });
      }
    }
  }
}

function parseNeighborOutput(platform, output) {
  const hostsMap = new Map();

  if (platform === "linux") {
    parseLinuxOutput(output, hostsMap);
  } else {
    parseBsdOutput(output, hostsMap);
  }

  return Array.from(hostsMap.values());
}

function filterLanHosts(hosts, serviceIp) {
  if (!serviceIp) return [];

  const serviceEntry = hosts.find((host) => host.ip === serviceIp);
  if (serviceEntry && serviceEntry.iface) {
    return hosts.filter(
      (host) => host.iface === serviceEntry.iface && isUnicast(host.ip)
    );
  }

  const octets = serviceIp.split(".");
  if (octets.length !== 4) {
    return [];
  }

  const prefix24 = `${octets[0]}.${octets[1]}.${octets[2]}.`;
  const lan24 = hosts.filter(
    (host) => String(host.ip).startsWith(prefix24) && isUnicast(host.ip)
  );
  if (lan24.length > 0) {
    return lan24;
  }

  const prefix16 = `${octets[0]}.${octets[1]}.`;
  return hosts.filter(
    (host) => String(host.ip).startsWith(prefix16) && isUnicast(host.ip)
  );
}

function buildLanFilterNote(serviceIp, lanHostCount) {
  if (!serviceIp) {
    return "No service host provided";
  }

  return lanHostCount > 0
    ? `Filtered by iface or prefix for ${serviceIp}`
    : `No LAN hosts matched for ${serviceIp}`;
}

export async function getRouterArpData({
  serviceIp,
  platform = process.platform,
}) {
  const cacheKey = buildCacheKey(platform, serviceIp);
  const cachedResult = getCachedResult(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  const rawOutput = await runNeighborLookup(platform);
  const hosts = parseNeighborOutput(platform, rawOutput);
  const lanHosts = filterLanHosts(hosts, serviceIp);

  const result = {
    hosts,
    lanHosts: Array.isArray(lanHosts) ? lanHosts : [],
    note: buildLanFilterNote(serviceIp, lanHosts.length),
  };

  setCachedResult(cacheKey, result);
  return result;
}
