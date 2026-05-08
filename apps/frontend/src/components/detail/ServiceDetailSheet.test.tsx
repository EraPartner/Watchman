// @vitest-environment jsdom
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- mutable data shared across tests ----------------------------------
let healthData: unknown = undefined;
let statsData: unknown = undefined;

vi.mock("@/hooks/useServiceHealth", () => ({
  useServiceHealth: () => ({ data: healthData, isLoading: false }),
  useServiceStats: () => ({ data: statsData, isLoading: false }),
}));

vi.mock("@/hooks/useWebSocketEvent", () => ({
  useWebSocketEvent: () => undefined,
}));

vi.mock("@/pages/Settings/useConfigQueries", () => ({
  useServices: () => ({ data: [] }),
  useUpdateService: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteService: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
  dotGet: () => undefined,
}));

// Heavy Radix primitives — replace with minimal HTML so jsdom renders children
vi.mock("@/components/primitives", async () => {
  const React = await import("react");
  return {
    Sheet: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
    SheetContent: ({ children }: { children: ReactNode }) => React.createElement("div", { "data-testid": "sheet-content" }, children),
    SheetHeader: ({ children }: { children: ReactNode }) => React.createElement("div", { "data-testid": "sheet-header" }, children),
    SheetBody: ({ children }: { children: ReactNode }) => React.createElement("div", null, children),
    SheetFooter: ({ children }: { children: ReactNode }) => React.createElement("div", null, children),
    SheetTitle: ({ children }: { children: ReactNode }) => React.createElement("h2", null, children),
    SheetDescription: ({ children }: { children: ReactNode }) => React.createElement("p", null, children),
    StatusDot: ({ label, tone }: { label?: string; tone?: string; pulse?: boolean }) =>
      React.createElement("span", { role: "status", "aria-label": label ?? tone ?? undefined }),
    Badge: ({ children }: { children: ReactNode }) => React.createElement("span", null, children),
    Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) =>
      React.createElement("button", { onClick }, children),
    ConfirmDialog: () => null,
    Tabs: ({ children }: { children: ReactNode }) => React.createElement("div", null, children),
    TabsList: ({ children }: { children: ReactNode }) => React.createElement("div", null, children),
    TabsTrigger: ({ children }: { children: ReactNode }) => React.createElement("button", null, children),
    TabsContent: ({ children, value }: { children: ReactNode; value: string }) =>
      value === "metrics" ? React.createElement("div", null, children) : null,
    MetricValue: ({ value }: { value: string }) => React.createElement("span", null, value),
  };
});

vi.mock("../detail/EventLog", () => ({ EventLog: () => null }));
vi.mock("@/pages/Settings/ServiceEditor", () => ({ default: () => null }));

import { ServiceDetailSheet } from "./ServiceDetailSheet";

// ---- helpers -----------------------------------------------------------

async function render(open = true) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ServiceDetailSheet
        kind="bitcoin"
        instanceId="main"
        open={open}
        onOpenChange={() => {}}
      />
    );
  });
  return {
    container,
    cleanup: () => act(() => { root.unmount(); }),
  };
}

function statusDots(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[role="status"]'));
}

// ---- tests -------------------------------------------------------------

describe("ServiceDetailSheet two-tier status dots", () => {
  beforeEach(() => {
    healthData = undefined;
    statsData = undefined;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    document.body.innerHTML = "";
  });

  it("renders two dots in header when host and service tiers both present", async () => {
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

  it("single dot fallback when only host present", async () => {
    healthData = { reachable: true, host: { reachable: true } };

    const { container, cleanup } = await render();

    expect(statusDots(container).length).toBe(1);

    await cleanup();
  });

  it("single dot fallback when only service present", async () => {
    healthData = { reachable: true, service: { reachable: true } };

    const { container, cleanup } = await render();

    expect(statusDots(container).length).toBe(1);

    await cleanup();
  });
});
