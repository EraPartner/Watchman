// Renderer audit test: verifies each renderer's summary[].key uses the
// keys actually produced by the backend service's getStats() metrics
// payload, OR is explicitly marked source:'health'.
//
// This is the primary defense against the regression where the dashboard
// shows "online" but every primary metric reads "—" because the renderer
// used a stale dot-path that no longer matches the backend.
//
// Backend keys are encoded as fixtures here so the test stays a unit
// test (no backend import). Update fixtures when backend schemas change.

import { describe, expect, it } from "vitest";
import type { ServiceKind } from "./types";
import { adguardRenderer } from "./adguard";
import { albyHubRenderer } from "./albyHub";
import { bitcoinRenderer } from "./bitcoin";
import { homebridgeRenderer } from "./homebridge";
import { ipfsRenderer } from "./ipfs";
import { macMiniRenderer } from "./macMini";
import { philipsBridgeRenderer } from "./philipsBridge";
import { qbittorrentRenderer } from "./qbittorrent";
import { raspberryPiRenderer } from "./raspberryPi";
import { roonRenderer } from "./roon";
import { synologyRenderer } from "./synology";

// Backend metrics keys per service (top-level keys returned in `metrics: {}`)
// from apps/backend/src/domain/services/<kind>/<Kind>Service.ts. Health-side
// keys live in the HealthSnapshot envelope (`reachable`, `latencyMs`, `host`,
// `service`, `details`, `at`, `message`).
const BACKEND_STATS_KEYS: Partial<Record<ServiceKind, ReadonlyArray<string>>> = {
  adguard: [
    "version",
    "running",
    "protectionEnabled",
    "dnsPort",
    "httpPort",
    "totalQueries",
    "blockedQueries",
    "allowedQueries",
    "blockingRate",
    "avgProcessingTime",
    "topBlockedDomain",
    "topQueriedDomain",
    "topClient",
    "safebrowsingBlocked",
    "safesearchBlocked",
    "parentalBlocked",
    "filteringEnabled",
    "filterCount",
    "totalRules",
    "userRules",
    "clientCount",
    "autoClientCount",
    "dhcpEnabled",
    "dhcpLeases",
    "dhcpStaticLeases",
    "safebrowsingEnabled",
    "parentalEnabled",
    "safesearchEnabled",
    "upstreamCount",
    "upstreamMode",
  ],
  albyhub: [
    "name",
    "version",
    "description",
    "endpoint",
    "url",
    "reachable",
    "connected",
    "setupCompleted",
    "backendType",
    "appCount",
  ],
  bitcoin: [
    "version",
    "protocolVersion",
    "chain",
    "blocks",
    "headers",
    "connections",
    "inbound",
    "outbound",
    "difficulty",
    "verificationProgress",
    "initialBlockDownload",
    "blockchainSize",
    "networkHashPs",
    "mempoolSize",
    "mempoolBytes",
    "mempoolUsage",
    "mempoolMax",
    "mempoolMinFee",
    "uptime",
    "peerCount",
    "totalBytesRecv",
    "totalBytesSent",
    "hashesPerSec",
    "txIndexSynced",
    "txIndexHeight",
  ],
  homebridge: [
    "hostname",
    "platform",
    "homebridgeVersion",
    "serverVersion",
    "uptime",
    "currentVersion",
  ],
  ipfs: [
    "version",
    "nodeId",
    "addressCount",
    "peers",
    "repoSize",
    "numObjects",
    "bwTotalIn",
    "bwTotalOut",
    "bwRateIn",
    "bwRateOut",
    "memAllocMb",
    "goroutines",
    "numCPU",
    "dhtPeers",
    "pinnedCount",
    "listenAddrCount",
  ],
  macmini: [
    "host",
    "cpuLoad",
    "cpuTemp",
    "cpuUser",
    "cpuSys",
    "cpuIdle",
    "processCount",
    "diskTotal",
    "diskUsed",
    "diskFree",
    "diskUsagePercent",
    "diskModel",
    "diskTemp",
    "smartPassed",
    "memFreeBytes",
    "memActiveBytes",
    "memWiredBytes",
    "memInactiveBytes",
    "memTotalBytes",
    "onAC",
    "uptime",
  ],
  philips: [
    "host",
    "configured",
    "lightCount",
    "onCount",
    "offCount",
  ],
  qbittorrent: [
    "version",
    "uptime",
    "torrentsTotal",
    "torrentsDownloading",
    "torrentsSeeding",
    "torrentsPaused",
    "torrentsCompleted",
    "torrentsError",
    "dlSpeed",
    "upSpeed",
    "dlData",
    "upData",
    "connectionStatus",
    "listenPort",
    "dhtNodes",
    "freeSpaceOnDisk",
    "activeTorrents",
    "recentErrors",
    "recentWarnings",
  ],
  raspi: [
    "piModel",
    "processor",
    "memory",
    "prettyName",
    "cpuTemp",
    "clockRate",
    "voltage",
    "throttled",
    "load",
    "uptime",
    "isRpi",
    "pigpioVersion",
    "rpiCliAvailable",
    "rpiCliError",
  ],
  roon: [
    "host",
    "portCount",
    "pingEnabled",
    "configured",
    "paired",
    "zoneCount",
    "activeZones",
    "nowPlaying",
  ],
  synology: [
    "host",
    "systemName",
    "systemModel",
    "systemVersion",
    "systemStatus",
    "uptime",
    "cpuUsage",
    "cpuTemp",
    "memoryTotal",
    "memoryAvailable",
    "memoryUsed",
    "memoryUsagePercent",
    "diskTotal",
    "diskUsed",
    "diskFree",
    "diskUsagePercent",
    "networkRx",
    "networkTx",
    "dsmModel",
    "dsmVersion",
    "dsmTemperature",
    "cpuFanStatus",
    "sysFanStatus",
    "powerStatus",
    "volumeCount",
    "volumeDegradedCount",
    "diskCount",
    "diskDegradedCount",
  ],
};

// Health-side keys that may be referenced with source:'health'.
const HEALTH_KEYS = new Set([
  "reachable",
  "latencyMs",
  "at",
  "message",
  "host",
  "service",
  "details",
]);

const RENDERERS = {
  adguard: adguardRenderer,
  albyhub: albyHubRenderer,
  bitcoin: bitcoinRenderer,
  homebridge: homebridgeRenderer,
  ipfs: ipfsRenderer,
  macmini: macMiniRenderer,
  philips: philipsBridgeRenderer,
  qbittorrent: qbittorrentRenderer,
  raspi: raspberryPiRenderer,
  roon: roonRenderer,
  synology: synologyRenderer,
} as const satisfies Partial<Record<ServiceKind, { summary: ReadonlyArray<{ key: string; source?: "stats" | "health" }> }>>;

describe("renderer summary key audit", () => {
  for (const [kind, renderer] of Object.entries(RENDERERS)) {
    const backend = BACKEND_STATS_KEYS[kind as ServiceKind] ?? [];

    it(`${kind} summary keys exist in backend stats payload (or are tagged source:'health')`, () => {
      for (const metric of renderer.summary) {
        // Dot-paths read the first path segment from the metrics object.
        const head = metric.key.split(".")[0]!;
        if (metric.source === "health") {
          expect(HEALTH_KEYS, `${kind}.${metric.key} marked source:'health'`).toContain(head);
        } else {
          expect(
            backend,
            `${kind}.${metric.key} must be in backend metrics or marked source:'health'`,
          ).toContain(head);
        }
      }
    });
  }
});
