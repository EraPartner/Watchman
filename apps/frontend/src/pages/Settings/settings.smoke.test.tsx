// @vitest-environment jsdom
/// <reference types="node" />
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
    mutateAsync: vi.fn(() => Promise.resolve({})),
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
  apiClient: { getAggregatedServices: vi.fn(() => Promise.resolve([])) },
  sharedCore: { request: vi.fn(() => Promise.resolve({})) },
}));

vi.mock("../../services/configApi", () => ({
  configApi: {
    getAuditLog: vi.fn(() => Promise.resolve([])),
    getServices: vi.fn(() => Promise.resolve([])),
    getKinds: vi.fn(() => Promise.resolve([])),
    exportConfig: vi.fn(() => Promise.resolve({ services: [] })),
    importConfig: vi.fn(() => Promise.resolve({ imported: 0, skipped: 0, errors: [] })),
    testConnection: vi.fn(() => Promise.resolve({ ok: true })),
    createService: vi.fn(() => Promise.resolve({})),
    updateService: vi.fn(() => Promise.resolve({})),
    deleteService: vi.fn(() => Promise.resolve(undefined)),
    getSetupStatus: vi.fn(() => Promise.resolve({ needsSetup: false })),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { useMutation, useQuery } from "@tanstack/react-query";
import Audit from "./Audit";
import BackupRestore from "./BackupRestore";
import Services from "./Services";
import { actAsync } from "@/test/actAsync";
import { SettingsLayout } from "./SettingsLayout";
import { required } from "@/test/required";

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
  await actAsync(() => root.render(element));
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

  it("omits the target for entries without one instead of rendering a bare slash", async () => {
    vi.mocked(useQuery).mockReturnValueOnce({
      data: [
        {
          id: 2,
          ts: "2026-01-01T00:00:00Z",
          action: "export",
          targetKind: null,
          targetId: null,
          diff: { count: 1 },
          actor: null,
        },
        {
          id: 1,
          ts: "2026-01-01T00:00:00Z",
          action: "create",
          targetKind: "ipfs",
          targetId: "svc-1",
          diff: {},
          actor: "alice",
        },
      ],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>);
    const { container, root } = await render(<Audit />);
    const targets = Array.from(
      container.querySelectorAll("li span.font-mono.text-\\[var\\(--text-hi\\)\\]")
    ).map((el) => el.textContent);
    expect(targets).toEqual(["ipfs/svc-1"]);
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

  it("warns that services which fail to load are left out of the backup", async () => {
    vi.mocked(useQuery).mockReturnValueOnce({
      data: [{ id: "x", kind: "adguard", instanceId: "broken", message: "bad" }],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>);
    const { container, root } = await render(<BackupRestore />);
    expect(container.textContent).toContain(
      "1 service(s) fail to load and will not be in the backup"
    );
    expect(container.textContent).toContain("adguard/broken");
    act(() => root.unmount());
  });

  it("does not leak an unhandled rejection when export fails", async () => {
    const failing = {
      mutateAsync: vi.fn(() => Promise.reject(new Error("boom"))),
      mutate: vi.fn(),
      isPending: false,
      isError: true,
      error: new Error("boom"),
      reset: vi.fn(),
    };
    // First useMutation call in BackupRestore is the export mutation.
    vi.mocked(useMutation).mockReturnValueOnce(
      failing as unknown as ReturnType<typeof useMutation>
    );
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const { container, root } = await render(<BackupRestore />);
      const button = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Download backup"
      );
      await act(async () => {
        required(button).click();
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(failing.mutateAsync).toHaveBeenCalledTimes(1);
      expect(unhandled).not.toHaveBeenCalled();
      expect(container.textContent).toContain("boom");
      act(() => root.unmount());
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});

// ─── Services ─────────────────────────────────────────────────────────────────

describe("Services page", () => {
  it("renders without crashing", async () => {
    const { container, root } = await render(<Services />);
    expect(container.querySelector("main")).toBeTruthy();
    act(() => root.unmount());
  });

  it("resends the stored config when toggling enabled", async () => {
    // PUT replaces the config, so a bare { enabled } dropped required fields.
    const { useQuery, useMutation } = await import("@tanstack/react-query");
    const svc = {
      id: "svc-1",
      kind: "ipfs",
      instanceId: "main",
      enabled: true,
      profileId: "p1",
      config: { kind: "ipfs", apiUrl: "http://127.0.0.1:5001" },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    const mutate = vi.fn();
    vi.mocked(useQuery).mockImplementation(((opts: { queryKey: unknown[] }) => ({
      data:
        opts.queryKey[0] === "config" && opts.queryKey[1] === "services"
          ? [svc]
          : undefined,
      isLoading: false,
      error: null,
    })) as unknown as typeof useQuery);
    vi.mocked(useMutation).mockImplementation((() => ({
      mutateAsync: vi.fn(() => Promise.resolve({})),
      mutate,
      isPending: false,
    })) as unknown as typeof useMutation);
    try {
      const { container, root } = await render(<Services />);
      const btn = required(Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Disable"
      ));
      await actAsync(() => {
        btn.click();
      });
      expect(mutate).toHaveBeenCalledWith(
        {
          id: "svc-1",
          input: {
            instanceId: "main",
            enabled: false,
            config: {
              kind: "ipfs",
              apiUrl: "http://127.0.0.1:5001",
              enabled: false,
            },
          },
        },
        expect.anything()
      );
      act(() => root.unmount());
    } finally {
      vi.mocked(useQuery).mockImplementation((() => ({
        data: undefined,
        isLoading: false,
        error: null,
      })) as unknown as typeof useQuery);
      vi.mocked(useMutation).mockImplementation((() => ({
        mutateAsync: vi.fn(() => Promise.resolve({})),
        mutate: vi.fn(),
        isPending: false,
        isError: false,
        error: null,
        reset: vi.fn(),
      })) as unknown as typeof useMutation);
    }
  });

  it("reports a failed enable/disable instead of failing silently", async () => {
    const { useQuery, useMutation } = await import("@tanstack/react-query");
    const { toast } = await import("sonner");
    const svc = {
      id: "svc-1",
      kind: "ipfs",
      instanceId: "main",
      enabled: true,
      profileId: "p1",
      config: {},
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    vi.mocked(useQuery).mockImplementation(((opts: { queryKey: unknown[] }) => ({
      data:
        opts.queryKey[0] === "config" && opts.queryKey[1] === "services"
          ? [svc]
          : undefined,
      isLoading: false,
      error: null,
    })) as unknown as typeof useQuery);
    vi.mocked(useMutation).mockImplementation((() => ({
      mutateAsync: vi.fn(() => Promise.resolve({})),
      mutate: vi.fn((_vars: unknown, opts?: { onError?: (e: Error) => void }) =>
        opts?.onError?.(new Error("server said no"))
      ),
      isPending: false,
    })) as unknown as typeof useMutation);
    try {
      const { container, root } = await render(<Services />);
      const btn = required(Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Disable"
      ));
      await actAsync(() => {
        btn.click();
      });
      expect(toast.error).toHaveBeenCalledWith(
        "Could not disable ipfs/main: server said no"
      );
      act(() => root.unmount());
    } finally {
      vi.mocked(useQuery).mockImplementation((() => ({
        data: undefined,
        isLoading: false,
        error: null,
      })) as unknown as typeof useQuery);
      vi.mocked(useMutation).mockImplementation((() => ({
        mutateAsync: vi.fn(() => Promise.resolve({})),
        mutate: vi.fn(),
        isPending: false,
        isError: false,
        error: null,
        reset: vi.fn(),
      })) as unknown as typeof useMutation);
    }
  });
});
