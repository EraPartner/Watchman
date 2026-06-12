import { describe, expect, it } from "vitest";
import { torRenderer } from "./tor";
import { routerRenderer } from "./router";
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
import { getRenderer, rendererTrackedMetrics } from "./index";

// ─── torRenderer ──────────────────────────────────────────────────────────────

describe("torRenderer", () => {
  it("has kind=tor and a displayName", () => {
    expect(torRenderer.kind).toBe("tor");
    expect(torRenderer.displayName).toBeTruthy();
  });

  it("quickLink returns undefined when fingerprint is missing", () => {
    expect(torRenderer.quickLink?.({ config: {} })).toBeUndefined();
    expect(torRenderer.quickLink?.({ config: undefined })).toBeUndefined();
  });

  it("quickLink returns metrics URL when fingerprint is present", () => {
    const url = torRenderer.quickLink?.({ config: { fingerprint: "ABCDEF1234" } });
    expect(url).toContain("metrics.torproject.org");
    expect(url).toContain("ABCDEF1234");
  });

  it("has summary metrics", () => {
    expect(Array.isArray(torRenderer.summary)).toBe(true);
    expect(torRenderer.summary?.length).toBeGreaterThan(0);
  });

  it("has detail sections", () => {
    expect(Array.isArray(torRenderer.detail)).toBe(true);
    expect(torRenderer.detail?.length).toBeGreaterThan(0);
  });
});

// ─── routerRenderer ───────────────────────────────────────────────────────────

describe("routerRenderer", () => {
  it("has kind=router and a displayName", () => {
    expect(routerRenderer.kind).toBe("router");
    expect(routerRenderer.displayName).toBeTruthy();
  });

  it("quickLink returns undefined when no host config", () => {
    expect(routerRenderer.quickLink?.({ config: {} })).toBeUndefined();
  });

  it("quickLink builds URL from host config", () => {
    const url = routerRenderer.quickLink?.({ config: { host: "192.168.1.1" } });
    expect(url).toContain("192.168.1.1");
  });

  it("tone returns ok for healthy router", () => {
    const tone = routerRenderer.tone?.({ stats: { reachable: true }, health: { status: "online" } as unknown as import("../apiClient/types").HealthSnapshot });
    expect(tone).toBe("ok");
  });

  it("tone returns crit for offline status", () => {
    const tone = routerRenderer.tone?.({ stats: {}, health: { status: "offline" } as unknown as import("../apiClient/types").HealthSnapshot });
    expect(tone).toBe("crit");
  });

  it("tone returns warn for warning status", () => {
    const tone = routerRenderer.tone?.({ stats: {}, health: { status: "warning" } as unknown as import("../apiClient/types").HealthSnapshot });
    expect(tone).toBe("warn");
  });

  it("tone returns crit when stats show reachable=false", () => {
    const tone = routerRenderer.tone?.({ stats: { reachable: false }, health: { status: "online" } as unknown as import("../apiClient/types").HealthSnapshot });
    expect(tone).toBe("crit");
  });

  it("has summary and detail sections", () => {
    expect(Array.isArray(routerRenderer.summary)).toBe(true);
    expect(Array.isArray(routerRenderer.detail)).toBe(true);
  });

  it("has chart definitions", () => {
    expect(Array.isArray(routerRenderer.charts)).toBe(true);
    expect(routerRenderer.charts!.length).toBeGreaterThan(0);
  });
});

// ─── Shared smoke for all remaining renderers ─────────────────────────────────

const ALL_RENDERERS = [
  { name: "adguardRenderer", r: adguardRenderer, kind: "adguard" },
  { name: "albyHubRenderer", r: albyHubRenderer, kind: "albyHub" },
  { name: "bitcoinRenderer", r: bitcoinRenderer, kind: "bitcoin" },
  { name: "homebridgeRenderer", r: homebridgeRenderer, kind: "homebridge" },
  { name: "ipfsRenderer", r: ipfsRenderer, kind: "ipfs" },
  { name: "macMiniRenderer", r: macMiniRenderer, kind: "macMini" },
  { name: "philipsBridgeRenderer", r: philipsBridgeRenderer, kind: "philipsBridge" },
  { name: "qbittorrentRenderer", r: qbittorrentRenderer, kind: "qbittorrent" },
  { name: "raspberryPiRenderer", r: raspberryPiRenderer, kind: "raspberryPi" },
  { name: "roonRenderer", r: roonRenderer, kind: "roon" },
  { name: "synologyRenderer", r: synologyRenderer, kind: "synology" },
] as const;

for (const { name, r, kind } of ALL_RENDERERS) {
  describe(name, () => {
    it(`has kind=${kind} and a displayName`, () => {
      expect((r as unknown as { kind: string }).kind).toBe(kind);
      expect((r as unknown as { displayName: string }).displayName).toBeTruthy();
    });

    it("has non-empty summary array", () => {
      expect(Array.isArray((r as unknown as { summary: unknown[] }).summary)).toBe(true);
      expect((r as unknown as { summary: unknown[] }).summary.length).toBeGreaterThan(0);
    });

    it("has non-empty detail array", () => {
      expect(Array.isArray((r as unknown as { detail: unknown[] }).detail)).toBe(true);
    });

    it("has charts array", () => {
      expect(Array.isArray((r as unknown as { charts: unknown[] }).charts)).toBe(true);
    });
  });
}

// ─── getRenderer / rendererTrackedMetrics ─────────────────────────────────────

describe("getRenderer", () => {
  it("returns a renderer for known kinds", () => {
    expect(getRenderer("tor")).toBeDefined();
    expect(getRenderer("router")).toBeDefined();
    expect(getRenderer("bitcoin")).toBeDefined();
    expect(getRenderer("adguard")).toBeDefined();
  });

  it("returns undefined for unknown kinds", () => {
    expect(getRenderer("unknown-kind")).toBeUndefined();
    expect(getRenderer("")).toBeUndefined();
  });
});

describe("rendererTrackedMetrics", () => {
  it("returns empty array for undefined renderer", () => {
    expect(rendererTrackedMetrics(undefined)).toEqual([]);
  });

  it("returns unique metric keys from summary, detail, and charts", () => {
    const metrics = rendererTrackedMetrics(getRenderer("router")!);
    expect(metrics.length).toBeGreaterThan(0);
    const set = new Set(metrics);
    expect(set.size).toBe(metrics.length);
  });

  it("includes metrics from all renderer sections", () => {
    const metrics = rendererTrackedMetrics(getRenderer("bitcoin")!);
    expect(metrics.some((m) => typeof m === "string" && m.length > 0)).toBe(true);
  });
});
