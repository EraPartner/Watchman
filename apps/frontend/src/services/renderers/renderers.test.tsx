import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import type { ServiceHealth } from "@/types/api";
import {
  RENDERERS,
  getRenderer,
  rendererTrackedMetrics,
  type ServiceRenderer,
} from "./index";

// A broad stats object touching keys many renderers read, so tone/customPanel
// branches actually execute instead of short-circuiting on `undefined`.
const richStats: Record<string, unknown> = {
  // adguard
  running: true,
  protectionEnabled: true,
  version: "1.2.3",
  totalQueries: 12345,
  blockedQueries: 2345,
  allowedQueries: 10000,
  blockingRate: 0.19,
  avgProcessingTime: 1.23,
  safebrowsingBlocked: 3,
  safesearchBlocked: 4,
  parentalBlocked: 1,
  filterCount: 5,
  totalRules: 90000,
  userRules: 12,
  clientCount: 8,
  autoClientCount: 2,
  dhcpLeases: 3,
  dhcpStaticLeases: 1,
  dnsPort: 53,
  httpPort: 80,
  upstreamCount: 2,
  upstreamMode: "parallel",
  filteringEnabled: true,
  safebrowsingEnabled: false,
  safesearchEnabled: true,
  parentalEnabled: false,
  dhcpEnabled: true,
  topBlockedDomain: "ads.example.com",
  topQueriedDomain: "cdn.example.com",
  topClient: "10.0.0.2",
  // qbittorrent
  connectionStatus: "connected",
  upSpeed: 1024,
  dlSpeed: 2048,
  upData: 1_000_000,
  dlData: 2_000_000,
  torrentsTotal: 6,
  torrentsSeeding: 3,
  torrentsDownloading: 2,
  torrentsPaused: 1,
  torrentsCompleted: 4,
  freeSpaceOnDisk: 5_000_000_000,
  dhtNodes: 300,
  listenPort: 6881,
  ratio: "1.42",
  activeTorrents: [
    {
      hash: "abc",
      name: "ubuntu.iso",
      state: "downloading",
      progress: 0.42,
      dlspeed: 2048,
      upspeed: 512,
      eta: 3661,
      category: "linux",
    },
    { state: "error", progress: 1, eta: 0 },
    { name: "seed", state: "uploading", progress: 1, eta: 90_000_000 },
  ],
  recentErrors: ["disk full"],
  recentWarnings: ["tracker timeout"],
  // generic host / misc used by router/synology/roon/etc.
  reachable: true,
  host: "10.0.0.5",
  portCount: 3,
  configured: true,
  pingEnabled: true,
  uptime: 123456,
  temperature: 45,
  cpuPercent: 12,
  memoryPercent: 34,
};

// Degraded variant to exercise the crit/warn tone branches.
const degradedStats: Record<string, unknown> = {
  running: false,
  protectionEnabled: false,
  connectionStatus: "disconnected",
  reachable: false,
};

const health = (status: string): ServiceHealth =>
  ({ status }) as unknown as ServiceHealth;

const config: Record<string, unknown> = {
  host: "10.0.0.5",
  url: "http://10.0.0.5",
  address: "10.0.0.5",
  port: 8080,
  uiPort: 80,
  httpPort: 8080,
  uiUrl: "http://10.0.0.5:80",
};

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = false;
  document.body.innerHTML = "";
});

async function renderNode(node: ReactNode): Promise<void> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<div>{node}</div>));
  act(() => root.unmount());
}

describe("service renderers", () => {
  const entries = Object.values(RENDERERS) as ServiceRenderer[];

  it("registers a renderer for every keyed kind", () => {
    expect(entries.length).toBeGreaterThanOrEqual(13);
  });

  for (const renderer of entries) {
    describe(renderer.kind, () => {
      it("derives a tone across health/stats states", () => {
        for (const ctx of [
          { stats: undefined, health: health("offline") },
          { stats: undefined, health: health("warning") },
          { stats: richStats, health: health("online") },
          { stats: degradedStats, health: health("online") },
          { stats: undefined, health: undefined },
        ]) {
          const tone = renderer.tone(ctx);
          expect(["neutral", "ok", "warn", "crit"]).toContain(tone);
        }
      });

      it("builds a quick link when configured", () => {
        if (!renderer.quickLink) return;
        const link = renderer.quickLink({ config, instance: undefined });
        expect(link === undefined || typeof link === "string").toBe(true);
      });

      it("renders its custom panel and subtitle without throwing", async () => {
        for (const stats of [richStats, undefined]) {
          const ctx = { stats, health: health("online"), instance: undefined };
          if (renderer.customPanel) await renderNode(renderer.customPanel(ctx));
          if (renderer.subtitle) await renderNode(renderer.subtitle(ctx));
        }
      });

      it("exposes summary/detail/chart metric specs", () => {
        expect(Array.isArray(renderer.summary)).toBe(true);
        expect(Array.isArray(renderer.detail)).toBe(true);
        expect(Array.isArray(renderer.charts)).toBe(true);
        // Exercise every formatter with representative values.
        const specs = [
          ...renderer.summary,
          ...renderer.detail.flatMap((g) => g.metrics),
          ...renderer.charts.map((c) => ({ format: c.format })),
        ];
        for (const spec of specs) {
          expect(typeof spec.format(1234.5)).toBe("string");
          expect(typeof spec.format(undefined)).toBe("string");
          expect(typeof spec.format("x")).toBe("string");
        }
      });
    });
  }

  it("getRenderer resolves known kinds and rejects unknown ones", () => {
    expect(getRenderer("adguard")).toBeDefined();
    expect(getRenderer("does-not-exist")).toBeUndefined();
  });

  it("rendererTrackedMetrics flattens and de-dupes metric keys", () => {
    const metrics = rendererTrackedMetrics(RENDERERS.adguard);
    expect(metrics.length).toBeGreaterThan(0);
    expect(new Set(metrics).size).toBe(metrics.length);
    expect(rendererTrackedMetrics(undefined)).toEqual([]);
  });
});
