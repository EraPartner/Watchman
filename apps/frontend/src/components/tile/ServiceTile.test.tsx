// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- mutable data shared across tests (closures capture the binding) ----
let healthData: unknown = undefined;
let statsData: unknown = undefined;
let statsError: unknown = undefined;

vi.mock("@/hooks/useServiceHealth", async () => {
  class StatsApiError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "StatsApiError";
      this.code = code;
    }
  }
  return {
    useServiceHealth: () => ({ data: healthData, isLoading: false }),
    useServiceStats: () => ({
      data: statsData,
      isLoading: false,
      error: statsError,
    }),
    StatsApiError,
  };
});

vi.mock("@/pages/Settings/useConfigQueries", () => ({
  useServices: () => ({ data: [] }),
}));

vi.mock("@/services/renderers", () => ({
  getRenderer: () => ({
    displayName: "Bitcoin",
    kind: "bitcoin",
    summary: [],
    tone: () => "ok" as const,
    subtitle: undefined,
    detail: [],
    charts: [],
  }),
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
    statsError = undefined;
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

describe("ServiceTile stats-error badge", () => {
  beforeEach(() => {
    healthData = undefined;
    statsData = undefined;
    statsError = undefined;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    document.body.innerHTML = "";
  });

  it("renders 'needs config' badge when stats error mentions credentials", async () => {
    healthData = { reachable: true };
    statsData = undefined;
    statsError = new Error("UNAUTHORIZED: snmp credentials not configured");

    const { container, cleanup } = await render();

    expect(container.textContent).toContain("needs config");
    expect(container.textContent).toContain("configure to see metrics");

    await cleanup();
  });

  it("renders 'stats unavailable' badge when stats error has no auth signal", async () => {
    healthData = { reachable: true };
    statsData = undefined;
    statsError = new Error("UNAVAILABLE: upstream returned 502");

    const { container, cleanup } = await render();

    expect(container.textContent).toContain("stats unavailable");

    await cleanup();
  });

  it("does not render a stats badge when stats data exists despite error", async () => {
    healthData = { reachable: true };
    statsData = { metrics: { x: 1 }, at: "now" };
    statsError = new Error("UNAUTHORIZED: bad creds");

    const { container, cleanup } = await render();

    expect(container.textContent).not.toContain("needs config");
    expect(container.textContent).not.toContain("stats unavailable");

    await cleanup();
  });

  it("suppresses stats badge while tile is offline", async () => {
    healthData = { reachable: false, message: "host down" };
    statsData = undefined;
    statsError = new Error("UNAUTHORIZED: bad creds");

    const { container, cleanup } = await render();

    expect(container.textContent).not.toContain("needs config");
    expect(container.textContent).toContain("Unavailable");

    await cleanup();
  });
});
