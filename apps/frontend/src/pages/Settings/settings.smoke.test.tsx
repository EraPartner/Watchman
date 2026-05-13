// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("react-router-dom", () => ({
  NavLink: ({
    children,
    to,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    className?: string | ((p: { isActive: boolean }) => string);
    end?: boolean;
  }) => {
    const cls = typeof className === "function" ? className({ isActive: false }) : className;
    return h("a", { href: to, className: cls }, children);
  },
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    h("a", { href: to }, children),
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/" }),
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

vi.mock("../../services/configApi", () => ({
  configApi: {
    getAuditLog: vi.fn(async () => []),
    getServices: vi.fn(async () => []),
    getKinds: vi.fn(async () => []),
    exportConfig: vi.fn(async () => ({ services: [] })),
    importConfig: vi.fn(async () => ({ imported: 0, skipped: 0, errors: [] })),
    testConnection: vi.fn(async () => ({ ok: true })),
    createService: vi.fn(async () => ({})),
    updateService: vi.fn(async () => ({})),
    deleteService: vi.fn(async () => undefined),
    getSetupStatus: vi.fn(async () => ({ needsSetup: false })),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import Audit from "./Audit";
import BackupRestore from "./BackupRestore";
import Services from "./Services";
import { SettingsLayout } from "./SettingsLayout";

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

// ─── SettingsLayout ───────────────────────────────────────────────────────────

describe("SettingsLayout", () => {
  it("renders title and children", async () => {
    const { container, root } = await render(
      <SettingsLayout title="Test Page">
        <p id="child">child content</p>
      </SettingsLayout>
    );
    expect(container.textContent).toContain("Test Page");
    expect(container.querySelector("#child")).toBeTruthy();
    act(() => root.unmount());
  });

  it("renders optional eyebrow and description", async () => {
    const { container, root } = await render(
      <SettingsLayout
        eyebrow="settings · test"
        title="Test"
        description="A helpful description."
      >
        <span />
      </SettingsLayout>
    );
    expect(container.textContent).toContain("settings · test");
    expect(container.textContent).toContain("A helpful description.");
    act(() => root.unmount());
  });

  it("renders actions slot", async () => {
    const { container, root } = await render(
      <SettingsLayout title="Test" actions={<button id="action">Click</button>}>
        <span />
      </SettingsLayout>
    );
    expect(container.querySelector("#action")).toBeTruthy();
    act(() => root.unmount());
  });
});

// ─── Audit ────────────────────────────────────────────────────────────────────

describe("Audit page", () => {
  it("renders without crashing", async () => {
    const { container, root } = await render(<Audit />);
    expect(container.querySelector("main")).toBeTruthy();
    act(() => root.unmount());
  });

  it("renders page title", async () => {
    const { container, root } = await render(<Audit />);
    expect(container.textContent).toContain("Config audit");
    act(() => root.unmount());
  });
});

// ─── BackupRestore ────────────────────────────────────────────────────────────

describe("BackupRestore page", () => {
  it("renders without crashing", async () => {
    const { container, root } = await render(<BackupRestore />);
    expect(container.querySelector("main")).toBeTruthy();
    act(() => root.unmount());
  });
});

// ─── Services ─────────────────────────────────────────────────────────────────

describe("Services page", () => {
  it("renders without crashing", async () => {
    const { container, root } = await render(<Services />);
    expect(container.querySelector("main")).toBeTruthy();
    act(() => root.unmount());
  });
});
