// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useEnabledServicesMock = vi.fn();
const useServiceInstancesMock = vi.fn();
const useDashboardQueriesMock = vi.fn();

vi.mock("../hooks/useEnabledServices", () => ({
  useEnabledServices: () => useEnabledServicesMock(),
}));

vi.mock("../hooks/useServiceInstances", () => ({
  useServiceInstances: () => useServiceInstancesMock(),
}));

vi.mock("./dashboard/useDashboardQueries", () => ({
  useDashboardQueries: (...args: unknown[]) => useDashboardQueriesMock(...args),
}));

vi.mock("./AdGuardCard", () => ({ AdGuardCard: () => <div /> }));
vi.mock("./TorCard", () => ({ TorCard: () => <div /> }));
vi.mock("./BitcoinCard", () => ({ BitcoinCard: () => <div /> }));
vi.mock("./QBittorrentCard", () => ({ QBittorrentCard: () => <div /> }));
vi.mock("./IpfsCard", () => ({ IpfsCard: () => <div>IPFS CARD</div> }));
vi.mock("./SynologyCard", () => ({ SynologyCard: () => <div /> }));
vi.mock("./RoonCard", () => ({ RoonCard: () => <div /> }));
vi.mock("./PhilipsBridgeCard", () => ({ default: () => <div /> }));
vi.mock("./AlbyHubCard", () => ({ AlbyHubCard: () => <div /> }));
vi.mock("./MacMiniCard", () => ({ MacMiniCard: () => <div /> }));
vi.mock("./RaspberryPiCard", () => ({ RaspberryPiCard: () => <div /> }));
vi.mock("./NostrcheckCard", () => ({ NostrcheckCard: () => <div /> }));
vi.mock("./RouterCard", () => ({ default: () => <div /> }));
vi.mock("./HomebridgeCard", () => ({
  default: () => <div>HOMEBRIDGE CARD</div>,
}));

vi.mock("./dashboard/DashboardTileSection", () => ({
  DashboardTileSection: ({ rows }: { rows: React.ReactElement[][] }) => (
    <div>
      {rows.flat().map((tile, index) => (
        <React.Fragment key={index}>{tile}</React.Fragment>
      ))}
    </div>
  ),
}));

vi.mock("./ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("./ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("lucide-react", () => ({
  Activity: () => <span />,
  CheckCircle: () => <span />,
  RefreshCw: () => <span />,
  Server: () => <span />,
  Shield: () => <span />,
}));

import { LiveServerDashboard } from "./LiveServerDashboard";

function queryState({
  data,
  isLoading = false,
  dataUpdatedAt = 0,
}: {
  data?: unknown;
  isLoading?: boolean;
  dataUpdatedAt?: number;
}) {
  return {
    data,
    isLoading,
    dataUpdatedAt,
    refetch: vi.fn().mockResolvedValue(undefined),
  };
}

function createDashboardQueries(overrides: Record<string, unknown> = {}) {
  return {
    adguardQuery: queryState({}),
    torQuery: queryState({}),
    frontendConfigQuery: queryState({}),
    bitcoinQuery: queryState({}),
    qbittorrentQuery: queryState({}),
    ipfsQuery: queryState({}),
    synologyQuery: queryState({}),
    roonQuery: queryState({}),
    servicesHealthQuery: queryState({}),
    refreshEnabledQueries: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function renderDashboard() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<LiveServerDashboard />);
    await Promise.resolve();
  });

  return { container, root };
}

describe("LiveServerDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    useServiceInstancesMock.mockReturnValue({
      getInstances: () => [],
    });
  });

  afterEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = false;
    document.body.innerHTML = "";
  });

  it("shows loading state when all enabled queries are loading", async () => {
    useEnabledServicesMock.mockReturnValue({
      isServiceEnabled: (serviceName: string) => serviceName === "tor",
    });

    useDashboardQueriesMock.mockReturnValue(
      createDashboardQueries({
        adguardQuery: queryState({ isLoading: true }),
        torQuery: queryState({ isLoading: true }),
      })
    );

    const { container, root } = await renderDashboard();

    expect(container.textContent).not.toContain("Live Dashboard");

    act(() => root.unmount());
  });

  it("derives overview counts from services health data when available", async () => {
    useEnabledServicesMock.mockReturnValue({
      isServiceEnabled: () => false,
    });

    useDashboardQueriesMock.mockReturnValue(
      createDashboardQueries({
        servicesHealthQuery: queryState({
          data: {
            services: {
              adguard: { status: "online" },
              tor: { status: "offline" },
            },
          },
        }),
      })
    );

    const { container, root } = await renderDashboard();

    expect(container.textContent).toContain("1/2");
    expect(container.textContent).toContain("1 offline");

    act(() => root.unmount());
  });

  it("falls back to enabled service counts when services health is unavailable", async () => {
    const enabled = new Set(["bitcoin", "qbittorrent", "roon"]);

    useEnabledServicesMock.mockReturnValue({
      isServiceEnabled: (serviceName: string) => enabled.has(serviceName),
    });

    useDashboardQueriesMock.mockReturnValue(
      createDashboardQueries({
        bitcoinQuery: queryState({ data: { status: "online" } }),
        qbittorrentQuery: queryState({ data: { status: "offline" } }),
        roonQuery: queryState({ data: { status: "error" } }),
        servicesHealthQuery: queryState({ data: undefined }),
      })
    );

    const { container, root } = await renderDashboard();

    expect(container.textContent).toContain("1/3");
    expect(container.textContent).toContain("1 offline, 1 warning");

    act(() => root.unmount());
  });

  it("shows refreshing state while refresh action is pending", async () => {
    useEnabledServicesMock.mockReturnValue({
      isServiceEnabled: () => false,
    });

    let resolveRefresh: (() => void) | undefined;
    const refreshEnabledQueries = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        })
    );

    useDashboardQueriesMock.mockReturnValue(
      createDashboardQueries({ refreshEnabledQueries })
    );

    const { container, root } = await renderDashboard();

    const refreshButton = container.querySelector("button");
    expect(refreshButton?.textContent).toContain("Refresh");

    await act(async () => {
      refreshButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(refreshEnabledQueries).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Refreshing...");

    await act(async () => {
      resolveRefresh?.();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Refresh");

    act(() => root.unmount());
  });

  it("renders stacked IPFS and Homebridge tile when both services are enabled", async () => {
    useEnabledServicesMock.mockReturnValue({
      isServiceEnabled: (serviceName: string) =>
        serviceName === "ipfs" || serviceName === "homebridge",
    });

    useDashboardQueriesMock.mockReturnValue(createDashboardQueries());

    const { container, root } = await renderDashboard();

    expect(container.textContent).toContain("IPFS CARD");
    expect(container.textContent).toContain("HOMEBRIDGE CARD");

    act(() => root.unmount());
  });

  it("renders multi-instance and hardware/software stacked tiles with adguard overview stats", async () => {
    const enabled = new Set([
      "adguard",
      "tor",
      "bitcoin",
      "qbittorrent",
      "ipfs",
      "homebridge",
      "nostrcheck",
      "albyhub",
      "synology",
      "roon",
      "philips",
      "macmini",
      "raspi",
      "beryl",
      "telenet",
    ]);

    useEnabledServicesMock.mockReturnValue({
      isServiceEnabled: (serviceName: string) => enabled.has(serviceName),
    });

    useServiceInstancesMock.mockReturnValue({
      getInstances: (serviceName: string) => {
        if (serviceName === "adguard") {
          return [{ id: "adguard_1" }, { id: "adguard_2" }];
        }
        if (serviceName === "tor") {
          return [{ id: "tor_1" }, { id: "tor_2" }];
        }
        if (serviceName === "bitcoin") {
          return [{ id: "bitcoin_1" }, { id: "bitcoin_2" }];
        }
        if (serviceName === "qbittorrent") {
          return [{ id: "qbittorrent_1" }, { id: "qbittorrent_2" }];
        }
        return [];
      },
    });

    useDashboardQueriesMock.mockReturnValue(
      createDashboardQueries({
        adguardQuery: queryState({
          data: {
            health: { status: "online" },
            stats: {
              totalQueries: 1500,
              blockedQueries: 150,
              allowedQueries: 1350,
              topBlockedDomain: "ads.example",
            },
          },
          dataUpdatedAt: 100,
        }),
        torQuery: queryState({
          data: {
            running: true,
            nickname: "relay-node",
            bandwidth: { current: 1 },
            connections: { current: 1, total: 2 },
            circuits: { active: 1, total: 2 },
          },
          dataUpdatedAt: 200,
        }),
        frontendConfigQuery: queryState({
          data: {
            services: {
              tor: { ip: "10.0.0.1", port: 9050 },
              nostrcheck: { configured: true, relayUrl: "wss://relay.example" },
            },
          },
          dataUpdatedAt: 300,
        }),
        servicesHealthQuery: queryState({ data: undefined }),
      })
    );

    const { container, root } = await renderDashboard();

    expect(container.textContent).toContain("Top Blocked Domain");
    expect(container.textContent).toContain("ads.example");
    expect(container.textContent).toContain("150 blocked today");
    expect(container.textContent).toContain("1.5K");
    expect(container.textContent).toContain("10.0% blocked");
    expect(container.textContent).toContain("Degraded");
    expect(container.textContent).toContain("IPFS CARD");
    expect(container.textContent).toContain("HOMEBRIDGE CARD");

    act(() => root.unmount());
  });

  it("covers single-instance and fallback branches for no-query adguard and stacked alternatives", async () => {
    const enabled = new Set([
      "adguard",
      "tor",
      "bitcoin",
      "qbittorrent",
      "homebridge",
      "albyhub",
      "philips",
    ]);

    useEnabledServicesMock.mockReturnValue({
      isServiceEnabled: (serviceName: string) => enabled.has(serviceName),
    });

    useServiceInstancesMock.mockReturnValue({
      getInstances: () => [{ id: "single_1" }],
    });

    useDashboardQueriesMock.mockReturnValue(
      createDashboardQueries({
        adguardQuery: queryState({
          data: {
            health: { status: "offline" },
            stats: {
              totalQueries: 0,
              blockedQueries: 0,
              topBlockedDomain: "N/A",
            },
          },
          dataUpdatedAt: 1000,
        }),
        torQuery: queryState({ data: undefined, dataUpdatedAt: 0 }),
        servicesHealthQuery: queryState({
          data: {
            services: {
              a: { status: "offline" },
              b: { status: "online" },
              c: { status: "offline" },
            },
          },
        }),
      })
    );

    vi.useFakeTimers();

    const { container, root } = await renderDashboard();

    expect(container.textContent).toContain("None");
    expect(container.textContent).toContain("No queries");
    expect(container.textContent).toContain("Degraded");

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Updated");

    act(() => root.unmount());
    vi.useRealTimers();
  });

  it.each([
    [{ online: 4, total: 4 }, "Excellent"],
    [{ online: 3, total: 4 }, "Good"],
    [{ online: 1, total: 4 }, "Degraded"],
    [{ online: 0, total: 4 }, "Critical"],
  ] as const)("derives %s system health label", async (counts, label) => {
    const services = Object.fromEntries(
      Array.from({ length: counts.total }).map((_, index) => [
        `service_${index}`,
        { status: index < counts.online ? "online" : "offline" },
      ])
    );

    useEnabledServicesMock.mockReturnValue({
      isServiceEnabled: () => false,
    });

    useDashboardQueriesMock.mockReturnValue(
      createDashboardQueries({
        servicesHealthQuery: queryState({ data: { services } }),
      })
    );

    const { container, root } = await renderDashboard();
    expect(container.textContent).toContain(label);
    act(() => root.unmount());
  });
});
