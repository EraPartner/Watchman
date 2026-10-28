// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/" }),
  NavLink: ({ children, to }: { children: React.ReactNode; to: string }) =>
    h("a", { href: to }, children),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    h("a", { href: to }, children),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
  useMutation: vi.fn(() => ({
    mutateAsync: vi.fn(async () => ({})),
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  })),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("../../hooks/useServiceInstances", () => ({
  useServiceInstances: vi.fn(() => ({
    data: { instances: {}, timestamp: new Date().toISOString() },
    isLoading: false,
  })),
}));

vi.mock("@/hooks/useAggregatedHealth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useAggregatedHealth")>()),
  useAggregatedHealth: vi.fn(() => ({ data: undefined, isError: false })),
}));

vi.mock("../../hooks/useWebSocket", () => ({
  useWebSocket: () => ({
    isConnected: false,
    reconnectAttempts: 0,
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendMessage: vi.fn(),
  }),
}));

vi.mock("../../services/ApiClient", () => ({
  apiClient: { getAggregatedServices: vi.fn(async () => []) },
  sharedCore: { request: vi.fn(async () => ({})) },
}));

vi.mock("../../pages/Settings/useConfigQueries", () => ({
  useCreateService: vi.fn(() => ({
    mutateAsync: vi.fn(async () => ({})),
    isPending: false,
  })),
  useUpdateService: vi.fn(() => ({
    mutateAsync: vi.fn(async () => ({})),
    isPending: false,
  })),
  useDeleteService: vi.fn(() => ({
    mutateAsync: vi.fn(async () => undefined),
    isPending: false,
  })),
  useServices: vi.fn(() => ({ data: [], isLoading: false })),
  useKinds: vi.fn(() => ({ data: [], isLoading: false })),
  useTestService: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("../../services/configApi", () => ({
  configApi: {
    getKinds: vi.fn(async () => []),
    listServices: vi.fn(async () => []),
    createService: vi.fn(async () => ({})),
    testService: vi.fn(async () => ({ ok: true })),
    getSetupStatus: vi.fn(async () => ({ needsSetup: false })),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("../../pages/Settings/ServiceEditor", () => ({
  default: () => h("form", {}, h("button", { type: "submit" }, "Save")),
}));

// Records the props the detail sheet receives, so tests can drive open/close.
type SheetProps = {
  kind?: string;
  instanceId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
const { sheetSpy } = vi.hoisted(() => ({ sheetSpy: vi.fn() }));
const lastSheetProps = () => sheetSpy.mock.lastCall?.[0] as SheetProps;

vi.mock("@/components/detail/ServiceDetailSheet", () => ({
  ServiceDetailSheet: (props: SheetProps) => {
    sheetSpy(props);
    return null;
  },
}));

vi.mock("@/components/tile/ServiceTile", () => ({
  ServiceTile: ({
    kind,
    instanceId,
    onOpenDetail,
  }: {
    kind: string;
    instanceId?: string;
    onOpenDetail?: (ctx: { kind: string; instanceId?: string }) => void;
  }) =>
    h(
      "button",
      { type: "button", onClick: () => onOpenDetail?.({ kind, instanceId }) },
      `tile ${kind}/${instanceId}`
    ),
}));

import BentoDashboard from "./BentoDashboard";
import { useServiceInstances } from "../../hooks/useServiceInstances";
import { useServices } from "../../pages/Settings/useConfigQueries";
import { useAggregatedHealth } from "@/hooks/useAggregatedHealth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  document.body.innerHTML = "";
});

async function render(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return { container, root };
}

// ─── BentoDashboard ───────────────────────────────────────────────────────────

describe("BentoDashboard", () => {
  it("renders without crashing", async () => {
    const { container, root } = await render(<BentoDashboard />);
    expect(container.firstChild).toBeTruthy();
    act(() => root.unmount());
  });

  it("renders main layout wrapper", async () => {
    const { container, root } = await render(<BentoDashboard />);
    expect(container.querySelector("main")).toBeTruthy();
    act(() => root.unmount());
  });

  it("renders 'Service dashboard' heading", async () => {
    const { container, root } = await render(<BentoDashboard />);
    expect(container.textContent).toContain("Service dashboard");
    act(() => root.unmount());
  });

  it("renders home-lab observatory label", async () => {
    const { container, root } = await render(<BentoDashboard />);
    expect(container.textContent).toContain("home-lab observatory");
    act(() => root.unmount());
  });

  it("renders 'No services configured yet' when no instances", async () => {
    const { container, root } = await render(<BentoDashboard />);
    expect(container.textContent).toContain("No services configured yet");
    act(() => root.unmount());
  });

  it("renders 'Add your first service' button", async () => {
    const { container, root } = await render(<BentoDashboard />);
    expect(container.textContent).toContain("Add your first service");
    act(() => root.unmount());
  });

  it("renders TopNav with Add service button", async () => {
    const { container, root } = await render(<BentoDashboard />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
    act(() => root.unmount());
  });

  it("shows a load error, not the empty state, when instances fail to load", async () => {
    const refetch = vi.fn();
    const mocked = vi.mocked(useServiceInstances);
    const previous = mocked.getMockImplementation();
    mocked.mockImplementation(
      () =>
        ({
          data: undefined,
          isLoading: false,
          isError: true,
          error: new Error("Network error: Cannot connect to backend"),
          refetch,
        }) as unknown as ReturnType<typeof useServiceInstances>
    );
    const { container, root } = await render(h(BentoDashboard));
    expect(container.textContent).toContain("Couldn't load services");
    expect(container.textContent).toContain("Cannot connect to backend");
    expect(container.textContent).not.toContain("No services configured yet");
    const retry = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Retry"
    );
    await act(async () => {
      retry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(refetch).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    if (previous) mocked.mockImplementation(previous);
  });

  it("keeps the sheet's service while it closes", async () => {
    // Clearing the service on close made the sheet render "No renderer for
    // this service." during its exit animation.
    const mocked = vi.mocked(useServiceInstances);
    const previous = mocked.getMockImplementation();
    mocked.mockImplementation(
      () =>
        ({
          data: {
            instances: {
              bitcoin: { count: 1, instances: [{ id: "main", type: "bitcoin" }] },
            },
            timestamp: new Date().toISOString(),
          },
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        }) as unknown as ReturnType<typeof useServiceInstances>
    );
    sheetSpy.mockClear();
    const { container, root } = await render(h(BentoDashboard));
    expect(lastSheetProps().open).toBe(false);
    const tile = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "tile bitcoin/main"
    )!;
    await act(async () => {
      tile.click();
    });
    expect(lastSheetProps()).toMatchObject({
      kind: "bitcoin",
      instanceId: "main",
      open: true,
    });
    await act(async () => {
      lastSheetProps().onOpenChange(false);
    });
    expect(lastSheetProps()).toMatchObject({
      kind: "bitcoin",
      instanceId: "main",
      open: false,
    });
    await act(async () => root.unmount());
    if (previous) mocked.mockImplementation(previous);
  });

  it("says nothing is active, not 'none configured', when configured services are inactive", async () => {
    const mocked = vi.mocked(useServices);
    const previous = mocked.getMockImplementation();
    mocked.mockImplementation(
      () =>
        ({
          data: [{ id: "bitcoin:main", kind: "bitcoin", instanceId: "main" }],
          isLoading: false,
        }) as unknown as ReturnType<typeof useServices>
    );
    const { container, root } = await render(h(BentoDashboard));
    expect(container.textContent).toContain("Nothing active in this profile");
    expect(container.textContent).not.toContain("No services configured yet");
    const link = Array.from(container.querySelectorAll("a")).find(
      (a) => a.textContent === "Open settings"
    );
    expect(link?.getAttribute("href")).toBe("/settings/services");
    await act(async () => root.unmount());
    if (previous) mocked.mockImplementation(previous);
  });

  it("does not show the backend-unreachable banner while health polls succeed", async () => {
    const { container, root } = await render(h(BentoDashboard));
    expect(container.textContent).not.toContain("Backend unreachable");
    await act(async () => root.unmount());
  });

  it("shows a backend-unreachable banner when health errors with stale data", async () => {
    const mocked = vi.mocked(useAggregatedHealth);
    const previous = mocked.getMockImplementation();
    mocked.mockImplementation(
      () =>
        ({
          data: { entries: [], byKey: new Map(), fetchedAt: Date.now() - 60_000 },
          isError: true,
          error: new Error("Network error"),
        }) as unknown as ReturnType<typeof useAggregatedHealth>
    );
    const { container, root } = await render(h(BentoDashboard));
    expect(container.textContent).toContain(
      "Backend unreachable — showing data from"
    );
    await act(async () => root.unmount());
    if (previous) mocked.mockImplementation(previous);
  });

  it("shows the WebSocket connection dot at every width", async () => {
    const { container, root } = await render(h(BentoDashboard));
    const dot = container.querySelector('[aria-label="WebSocket disconnected"]');
    expect(dot).toBeTruthy();
    expect(dot!.className.split(/\s+/)).not.toContain("hidden");
    await act(async () => root.unmount());
  });
});
