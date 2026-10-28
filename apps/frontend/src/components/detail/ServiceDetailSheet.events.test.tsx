// @vitest-environment jsdom
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WsEvent } from "@/lib/wsEventBus";

// ---- mutable data shared across tests ----------------------------------
const { wsSpy, eventLogSpy, mutate } = vi.hoisted(() => ({
  wsSpy: vi.fn(),
  eventLogSpy: vi.fn(),
  mutate: vi.fn(),
}));
const wsHandler = () => wsSpy.mock.lastCall?.[1] as (ev: WsEvent) => void;
const loggedEvents = () =>
  (eventLogSpy.mock.lastCall?.[0] as ReadonlyArray<{ message: string }>) ?? [];

const rows = [
  {
    id: "row-btc",
    kind: "bitcoin",
    instanceId: "main",
    enabled: true,
    profileId: "default",
    config: { kind: "bitcoin", rpcUrl: "http://node:8332", rpcPassword: "***" },
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "row-tor",
    kind: "tor",
    instanceId: "main",
    enabled: true,
    profileId: "default",
    config: { kind: "tor" },
    createdAt: "",
    updatedAt: "",
  },
];

vi.mock("@/hooks/useServiceHealth", () => ({
  useServiceHealth: () => ({ data: undefined, isLoading: false }),
  useServiceStats: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("@/hooks/useWebSocketEvent", () => ({
  useWebSocketEvent: (type: string, handler: (ev: WsEvent) => void) =>
    wsSpy(type, handler),
}));

vi.mock("@/pages/Settings/useConfigQueries", () => ({
  useServices: () => ({ data: rows }),
  useUpdateService: () => ({ mutate, mutateAsync: vi.fn(), isPending: false }),
  useDeleteService: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/services/renderers", () => ({
  getRenderer: (kind: string) => ({
    displayName: kind,
    kind,
    summary: [],
    tone: () => "ok" as const,
    subtitle: undefined,
    detail: [],
    charts: [],
  }),
  rendererTrackedMetrics: () => [] as ReadonlyArray<string>,
  dotGet: () => undefined,
}));

vi.mock("@/components/primitives", async () => {
  const React = await import("react");
  const pass = ({ children }: { children?: ReactNode }) =>
    React.createElement("div", null, children);
  return {
    Sheet: pass,
    SheetContent: pass,
    SheetHeader: pass,
    SheetBody: pass,
    SheetFooter: pass,
    SheetTitle: pass,
    SheetDescription: pass,
    StatusDot: () => null,
    Badge: pass,
    Button: ({
      children,
      onClick,
    }: {
      children: ReactNode;
      onClick?: () => void;
    }) => React.createElement("button", { onClick }, children),
    ConfirmDialog: () => null,
    Tabs: pass,
    TabsList: pass,
    TabsTrigger: () => null,
    TabsContent: pass,
    MetricValue: () => null,
    Sparkline: () => null,
  };
});

vi.mock("./EventLog", () => ({
  EventLog: ({ events }: { events: ReadonlyArray<{ message: string }> }) => {
    eventLogSpy(events);
    return null;
  },
}));
vi.mock("./ChartsPanel", () => ({ ChartsPanel: () => null }));
vi.mock("./RawStatsPanel", () => ({ RawStatsPanel: () => null }));
vi.mock("./ConfigPanel", () => ({ ConfigPanel: () => null }));
vi.mock("@/pages/Settings/ServiceEditor", () => ({ default: () => null }));

import { ServiceDetailSheet } from "./ServiceDetailSheet";

describe("ServiceDetailSheet reused across tiles", () => {
  beforeEach(() => {
    wsSpy.mockReset();
    eventLogSpy.mockReset();
    mutate.mockReset();
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

  it("drops the previous service's live events when another tile opens", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const sheet = (kind: "bitcoin" | "tor") => (
      <ServiceDetailSheet
        kind={kind}
        instanceId="main"
        open
        onOpenChange={() => {}}
      />
    );
    await act(async () => {
      root.render(sheet("bitcoin"));
    });
    await act(async () => {
      wsHandler()({
        type: "alert",
        service: "bitcoin",
        instanceId: "main",
        level: "warning",
        message: "node behind",
        timestamp: new Date().toISOString(),
      });
    });
    expect(loggedEvents().map((e) => e.message)).toEqual(["node behind"]);

    await act(async () => {
      root.render(sheet("tor"));
    });
    // Regression: the Tor sheet listed Bitcoin's "node behind" alert.
    expect(loggedEvents()).toEqual([]);

    await act(async () => {
      root.unmount();
    });
  });

  it("resends the stored config when toggling enabled", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ServiceDetailSheet
          kind="bitcoin"
          instanceId="main"
          open
          onOpenChange={() => {}}
        />
      );
    });
    const disable = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Disable"
    )!;
    await act(async () => {
      disable.click();
    });
    expect(mutate).toHaveBeenCalledWith(
      {
        id: "row-btc",
        input: {
          instanceId: "main",
          enabled: false,
          config: {
            kind: "bitcoin",
            rpcUrl: "http://node:8332",
            rpcPassword: "***",
            enabled: false,
          },
        },
      },
      expect.anything()
    );
    await act(async () => {
      root.unmount();
    });
  });
});
