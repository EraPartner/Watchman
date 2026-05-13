// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
  useMutation: vi.fn(() => ({
    mutateAsync: vi.fn(async () => ({ ok: true })),
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  })),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/pages/Settings/useConfigQueries", () => ({
  useTestService: vi.fn(() => ({
    mutateAsync: vi.fn(async () => ({ ok: true })),
    isPending: false,
  })),
}));

vi.mock("@/lib/metricHistory", () => ({
  useMetricSeries: vi.fn(() => []),
  recordStats: vi.fn(),
  getSeries: vi.fn(() => []),
  _resetMetricHistoryForTests: vi.fn(),
  HISTORY_CAPACITY: 60,
}));

vi.mock("@/services/configApi", () => ({
  configApi: {
    testService: vi.fn(async () => ({ ok: true })),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { ChartsPanel } from "./ChartsPanel";
import { ConfigPanel } from "./ConfigPanel";
import { RawStatsPanel } from "./RawStatsPanel";

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

// ─── ChartsPanel ──────────────────────────────────────────────────────────────

describe("ChartsPanel", () => {
  it("renders 'No charts defined' when charts is empty", async () => {
    const { container, root } = await render(
      <ChartsPanel kind="tor" instanceId="main" charts={[]} tone="neutral" />
    );
    expect(container.textContent).toContain("No charts defined");
    act(() => root.unmount());
  });

  it("renders chart cards for provided specs", async () => {
    const charts = [
      { metric: "bw", label: "Bandwidth", kind: "area" as const, format: (v: number) => `${v}` },
    ];
    const { container, root } = await render(
      <ChartsPanel kind="tor" instanceId="main" charts={charts} tone="ok" />
    );
    expect(container.textContent).toContain("Bandwidth");
    act(() => root.unmount());
  });

  it("shows sample count in chart card", async () => {
    const charts = [
      { metric: "peers", label: "Peers", kind: "line" as const, format: (v: number) => `${v}` },
    ];
    const { container, root } = await render(
      <ChartsPanel kind="ipfs" instanceId={undefined} charts={charts} tone="neutral" />
    );
    expect(container.textContent).toContain("sample");
    act(() => root.unmount());
  });
});

// ─── ConfigPanel ──────────────────────────────────────────────────────────────

describe("ConfigPanel", () => {
  it("renders 'No configuration available' when service is undefined", async () => {
    const { container, root } = await render(<ConfigPanel service={undefined} />);
    expect(container.textContent).toContain("No configuration available");
    act(() => root.unmount());
  });

  it("renders service identity details", async () => {
    const service = {
      id: "tor:main",
      kind: "tor",
      instanceId: "main",
      enabled: true,
      config: { host: "127.0.0.1", port: 9051 },
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-02T00:00:00Z",
    };
    const { container, root } = await render(<ConfigPanel service={service} />);
    expect(container.textContent).toContain("tor");
    expect(container.textContent).toContain("main");
    act(() => root.unmount());
  });

  it("renders 'Test connection' button", async () => {
    const service = {
      id: "tor:main",
      kind: "tor",
      instanceId: "main",
      enabled: true,
      config: {},
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    const { container, root } = await render(<ConfigPanel service={service} />);
    expect(container.textContent).toContain("Test connection");
    act(() => root.unmount());
  });

  it("renders config key-value rows", async () => {
    const service = {
      id: "bitcoin:main",
      kind: "bitcoin",
      instanceId: "main",
      enabled: true,
      config: { host: "10.0.0.1", port: 8332 },
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    const { container, root } = await render(<ConfigPanel service={service} />);
    expect(container.textContent).toContain("host");
    expect(container.textContent).toContain("10.0.0.1");
    act(() => root.unmount());
  });

  it("renders secret placeholder for '***' values", async () => {
    const service = {
      id: "bitcoin:main",
      kind: "bitcoin",
      instanceId: "main",
      enabled: true,
      config: { rpcPassword: "***" },
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    const { container, root } = await render(<ConfigPanel service={service} />);
    expect(container.textContent).toContain("secret");
    act(() => root.unmount());
  });

  it("renders boolean and object config values via fmtConfigValue", async () => {
    const service = {
      id: "tor:main",
      kind: "tor",
      instanceId: "main",
      enabled: false,
      config: { isRelay: true, metadata: { region: "us-east" } },
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    const { container, root } = await render(<ConfigPanel service={service} />);
    expect(container.textContent).toContain("isRelay");
    expect(container.textContent).toContain("true");
    act(() => root.unmount());
  });

  it("invokes test connection and shows success toast", async () => {
    const { toast } = await import("sonner");
    const service = {
      id: "tor:main",
      kind: "tor",
      instanceId: "main",
      enabled: true,
      config: {},
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    const { container, root } = await render(<ConfigPanel service={service} />);
    const testBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Test connection")
    );
    await act(async () => { testBtn?.click(); });
    expect(toast.success).toHaveBeenCalled();
    act(() => root.unmount());
  });
});

// ─── RawStatsPanel ────────────────────────────────────────────────────────────

describe("RawStatsPanel", () => {
  it("renders 'Every reported metric is already shown above' when rows is empty", async () => {
    const { container, root } = await render(
      <RawStatsPanel renderer={undefined} stats={undefined} />
    );
    expect(container.textContent).toContain("Every reported metric");
    act(() => root.unmount());
  });

  it("renders unknown stats keys not in renderer", async () => {
    const renderer = {
      summary: [{ key: "peers", label: "Peers", format: String }],
      detail: [] as Array<{ label: string; metrics: Array<{ key: string }> }>,
      charts: [] as Array<{ metric: string }>,
    };
    const stats = { peers: 5, extraField: "some-value", anotherKey: 42 };
    const { container, root } = await render(
      <RawStatsPanel
        renderer={renderer as never}
        stats={stats}
      />
    );
    expect(container.textContent).toContain("extraField");
    expect(container.textContent).toContain("anotherKey");
    act(() => root.unmount());
  });

  it("excludes keys already in renderer summary", async () => {
    const renderer = {
      summary: [{ key: "peers", label: "Peers", format: String }],
      detail: [] as Array<{ label: string; metrics: Array<{ key: string }> }>,
      charts: [] as Array<{ metric: string }>,
    };
    const stats = { peers: 5, hiddenField: "shown" };
    const { container, root } = await render(
      <RawStatsPanel
        renderer={renderer as never}
        stats={stats}
      />
    );
    expect(container.textContent).not.toContain("peers");
    expect(container.textContent).toContain("hiddenField");
    act(() => root.unmount());
  });

  it("handles nested stats via flattening", async () => {
    const stats = { network: { uptime: 3600 } };
    const { container, root } = await render(
      <RawStatsPanel renderer={undefined} stats={stats} />
    );
    expect(container.textContent).toContain("network.uptime");
    act(() => root.unmount());
  });
});
