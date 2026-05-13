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

import BentoDashboard from "./BentoDashboard";

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
});
