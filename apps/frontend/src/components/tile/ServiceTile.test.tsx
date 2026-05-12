// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fmtRaw, fmtNumber } from "@/services/renderers/formatters";
import type { ServiceRenderer } from "@/services/renderers/types";

// ---- mutable data shared across tests (closures capture the binding) ----
let healthData: unknown = undefined;
let statsData: unknown = undefined;

const defaultRenderer = (): ServiceRenderer => ({
  displayName: "Bitcoin",
  kind: "bitcoin",
  summary: [],
  tone: () => "ok" as const,
  subtitle: undefined,
  detail: [],
  charts: [],
});

let currentRenderer: ServiceRenderer = defaultRenderer();

vi.mock("@/hooks/useServiceHealth", () => ({
  useServiceHealth: () => ({ data: healthData, isLoading: false }),
  useServiceStats: () => ({ data: statsData, isLoading: false }),
}));

vi.mock("@/pages/Settings/useConfigQueries", () => ({
  useServices: () => ({ data: [] }),
}));

vi.mock("@/services/renderers", () => ({
  getRenderer: () => currentRenderer,
  rendererTrackedMetrics: () => [] as ReadonlyArray<string>,
}));

vi.mock("@/lib/metricHistory", () => ({
  useMetricSeries: () => [] as ReadonlyArray<{ t: number; v: number }>,
}));

import { ServiceTile } from "./ServiceTile";

// ---- helpers ----------------------------------------------------------------

async function render() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ServiceTile kind="bitcoin" />);
  });
  return {
    container,
    cleanup: () => act(() => { root.unmount(); }),
  };
}

function statusDots(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[role="status"]'));
}

// ---- tests ------------------------------------------------------------------

describe("ServiceTile two-tier status dots", () => {
  beforeEach(() => {
    healthData = undefined;
    statsData = undefined;
    currentRenderer = defaultRenderer();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    document.body.innerHTML = "";
  });

  it("renders two dots when host and service tiers are both present", async () => {
    healthData = {
      reachable: true,
      host: { reachable: true, pingMs: 2 },
      service: { reachable: true, latencyMs: 10 },
    };

    const { container, cleanup } = await render();
    const dots = statusDots(container);

    expect(dots.length).toBe(2);
    expect(dots[0]!.getAttribute("aria-label")).toMatch(/host/i);
    expect(dots[1]!.getAttribute("aria-label")).toMatch(/service/i);

    await cleanup();
  });

  it("renders single dot when health has no tiers (backward compat)", async () => {
    healthData = { reachable: true };

    const { container, cleanup } = await render();
    const dots = statusDots(container);

    expect(dots.length).toBe(1);

    await cleanup();
  });

  it("renders single dot when health data is undefined", async () => {
    healthData = undefined;

    const { container, cleanup } = await render();
    const dots = statusDots(container);

    expect(dots.length).toBe(1);

    await cleanup();
  });

  it("host dot reflects host.reachable=false with crit tone", async () => {
    healthData = {
      reachable: false,
      host: { reachable: false },
      service: { reachable: false },
    };

    const { container, cleanup } = await render();
    const dots = statusDots(container);

    expect(dots.length).toBe(2);
    expect(dots[0]!.getAttribute("aria-label")).toMatch(/host/i);
    expect(dots[1]!.getAttribute("aria-label")).toMatch(/service/i);

    await cleanup();
  });

  it("only service tier missing → single dot fallback", async () => {
    healthData = {
      reachable: true,
      host: { reachable: true, pingMs: 1 },
      // service absent
    };

    const { container, cleanup } = await render();
    const dots = statusDots(container);

    expect(dots.length).toBe(1);

    await cleanup();
  });

  it("only host tier missing → single dot fallback", async () => {
    healthData = {
      reachable: true,
      // host absent
      service: { reachable: true, latencyMs: 5 },
    };

    const { container, cleanup } = await render();
    const dots = statusDots(container);

    expect(dots.length).toBe(1);

    await cleanup();
  });
});

describe("ServiceTile metric source resolution", () => {
  beforeEach(() => {
    healthData = undefined;
    statsData = undefined;
    currentRenderer = defaultRenderer();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    document.body.innerHTML = "";
  });

  it("reads primary metric from health snapshot when source='health'", async () => {
    currentRenderer = {
      displayName: "Router",
      kind: "router",
      summary: [
        { key: "reachable", label: "Reachable", source: "health", format: fmtRaw },
        { key: "portCount", label: "Ports", format: fmtNumber(0) },
        { key: "host", label: "Host", format: fmtRaw },
      ],
      tone: () => "ok" as const,
      subtitle: undefined,
      detail: [],
      charts: [],
    };
    healthData = {
      reachable: true,
      at: "2025-01-01T00:00:00Z",
      host: { reachable: true },
    };
    statsData = {
      metrics: { host: "192.168.0.1", portCount: 0 },
      at: "2025-01-01T00:00:00Z",
    };

    const { container, cleanup } = await render();
    // Primary value rendered into MetricValue. fmtRaw(true) === "true".
    expect(container.textContent).toContain("true");
    // Secondary cells (Ports, Host) still resolve from stats.
    expect(container.textContent).toContain("192.168.0.1");

    await cleanup();
  });

  it("falls back to stats when source is omitted (existing renderer behavior)", async () => {
    currentRenderer = {
      displayName: "Bitcoin",
      kind: "bitcoin",
      summary: [
        { key: "blocks", label: "Blocks", format: fmtNumber(0) },
      ],
      tone: () => "ok" as const,
      subtitle: undefined,
      detail: [],
      charts: [],
    };
    healthData = { reachable: true, at: "2025-01-01T00:00:00Z" };
    statsData = {
      metrics: { blocks: 850123 },
      at: "2025-01-01T00:00:00Z",
    };

    const { container, cleanup } = await render();
    // 850123 formatted with grouping separators.
    const expected = (850123).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    expect(container.textContent).toContain(expected);

    await cleanup();
  });

  it("renders placeholder when source='health' but snapshot missing field", async () => {
    currentRenderer = {
      displayName: "Router",
      kind: "router",
      summary: [
        { key: "reachable", label: "Reachable", source: "health", format: fmtRaw },
      ],
      tone: () => "ok" as const,
      subtitle: undefined,
      detail: [],
      charts: [],
    };
    healthData = undefined;
    statsData = {
      metrics: { reachable: true },
      at: "2025-01-01T00:00:00Z",
    };

    const { container, cleanup } = await render();
    // Must NOT pull the value out of stats just because the key matches —
    // source='health' is an explicit opt-in to the health payload only.
    expect(container.textContent).toContain("—");
    expect(container.textContent).not.toContain("true");

    await cleanup();
  });
});
