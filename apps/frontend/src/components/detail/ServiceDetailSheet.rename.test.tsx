// @vitest-environment jsdom
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- mutable data shared across tests ----------------------------------
type Row = {
  id: string;
  kind: string;
  instanceId: string;
  enabled: boolean;
  profileId: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};
let services: Row[] = [];
const healthCalls: Array<string | undefined> = [];

vi.mock("@/hooks/useServiceHealth", () => ({
  useServiceHealth: (_kind: string, instanceId?: string) => {
    healthCalls.push(instanceId);
    return { data: undefined, isLoading: false };
  },
  useServiceStats: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("@/hooks/useWebSocketEvent", () => ({
  useWebSocketEvent: () => undefined,
}));

// The update rewrites the stored row, the way the refetch after the
// mutation's invalidation would.
vi.mock("@/pages/Settings/useConfigQueries", () => ({
  useServices: () => ({ data: services }),
  useUpdateService: () => ({
    mutate: vi.fn(),
    isPending: false,
    mutateAsync: async ({
      id,
      input,
    }: {
      id: string;
      input: { instanceId?: string };
    }) => {
      services = services.map((s) =>
        s.id === id && input.instanceId
          ? { ...s, instanceId: input.instanceId }
          : s
      );
    },
  }),
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
    TabsTrigger: pass,
    TabsContent: () => null,
    MetricValue: () => null,
    Sparkline: () => null,
  };
});

vi.mock("../detail/EventLog", () => ({ EventLog: () => null }));

// The editor submits a rename of the instance id.
vi.mock("@/pages/Settings/ServiceEditor", async () => {
  const React = await import("react");
  return {
    default: ({
      onSubmit,
    }: {
      onSubmit: (input: { instanceId: string }) => Promise<void>;
    }) =>
      React.createElement(
        "button",
        { onClick: () => void onSubmit({ instanceId: "renamed" }) },
        "Submit rename"
      ),
  };
});

import { ServiceDetailSheet } from "./ServiceDetailSheet";

function button(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === label
  );
}

describe("ServiceDetailSheet after renaming the instance", () => {
  beforeEach(() => {
    services = [
      {
        id: "row-1",
        kind: "bitcoin",
        instanceId: "node-a",
        enabled: true,
        profileId: "default",
        config: {},
        createdAt: "",
        updatedAt: "",
      },
    ];
    healthCalls.length = 0;
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

  it("keeps showing the edited service under its new id", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const ui = (
      <ServiceDetailSheet
        kind="bitcoin"
        instanceId="node-a"
        open
        onOpenChange={() => {}}
      />
    );
    await act(async () => {
      root.render(ui);
    });
    expect(button(container, "Edit")).toBeTruthy();

    await act(async () => {
      button(container, "Edit")!.click();
    });
    await act(async () => {
      button(container, "Submit rename")!.click();
    });
    // Re-render with the same props, as the parent does after the refetch.
    await act(async () => {
      root.render(ui);
    });

    // Regression: the sheet kept looking up "node-a", found nothing and
    // showed an empty footer with no data.
    expect(button(container, "Edit")).toBeTruthy();
    expect(healthCalls[healthCalls.length - 1]).toBe("renamed");

    await act(async () => {
      root.unmount();
    });
  });
});
