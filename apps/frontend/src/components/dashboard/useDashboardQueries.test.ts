import { describe, expect, it, vi } from "vitest";

const useQueryMock = vi.fn();
const apiClientMock = vi.hoisted(() => ({
  getAdGuardStatus: vi.fn(),
  getAdGuardStats: vi.fn(),
  getTorRelay: vi.fn(),
  getFrontendConfig: vi.fn(),
  getBitcoinStatus: vi.fn(),
  getQBittorrentStatus: vi.fn(),
  getIpfsStatus: vi.fn(),
  getSynologyStatus: vi.fn(),
  getRoonStatus: vi.fn(),
  getServicesHealth: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("../../services/ApiClient", () => ({
  apiClient: apiClientMock,
}));

import { useDashboardQueries } from "./useDashboardQueries";

function createRefetch(label: string) {
  return vi.fn().mockResolvedValue({ data: label });
}

describe("useDashboardQueries", () => {
  it("adguard queryFn merges health and stats results", async () => {
    useQueryMock
      .mockReturnValueOnce({ refetch: vi.fn() })
      .mockReturnValue({ refetch: vi.fn() });

    apiClientMock.getAdGuardStatus.mockResolvedValue({ status: "online" });
    apiClientMock.getAdGuardStats.mockResolvedValue({ totalQueries: 42 });

    useDashboardQueries({
      adguardEnabled: true,
      isServiceEnabled: () => false,
    });

    const adguardOptions = useQueryMock.mock.calls[0][0] as {
      queryFn: () => Promise<unknown>;
    };
    const result = await adguardOptions.queryFn();

    expect(apiClientMock.getAdGuardStatus).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getAdGuardStats).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      health: { status: "online" },
      stats: { totalQueries: 42 },
    });
  });

  it("refetches only enabled service queries and always services health", async () => {
    const adguardRefetch = createRefetch("adguard");
    const torRefetch = createRefetch("tor");
    const frontendConfigRefetch = createRefetch("frontendConfig");
    const bitcoinRefetch = createRefetch("bitcoin");
    const qbittorrentRefetch = createRefetch("qbittorrent");
    const ipfsRefetch = createRefetch("ipfs");
    const synologyRefetch = createRefetch("synology");
    const roonRefetch = createRefetch("roon");
    const servicesHealthRefetch = createRefetch("servicesHealth");

    useQueryMock
      .mockReturnValueOnce({ refetch: adguardRefetch })
      .mockReturnValueOnce({ refetch: torRefetch })
      .mockReturnValueOnce({ refetch: frontendConfigRefetch })
      .mockReturnValueOnce({ refetch: bitcoinRefetch })
      .mockReturnValueOnce({ refetch: qbittorrentRefetch })
      .mockReturnValueOnce({ refetch: ipfsRefetch })
      .mockReturnValueOnce({ refetch: synologyRefetch })
      .mockReturnValueOnce({ refetch: roonRefetch })
      .mockReturnValueOnce({ refetch: servicesHealthRefetch });

    const enabledServices = new Set(["bitcoin", "ipfs", "roon"]);

    const { refreshEnabledQueries } = useDashboardQueries({
      adguardEnabled: true,
      frontendConfigEnabled: false,
      isServiceEnabled: (serviceName) => enabledServices.has(serviceName),
    });

    await refreshEnabledQueries();

    expect(adguardRefetch).toHaveBeenCalledTimes(1);
    expect(torRefetch).not.toHaveBeenCalled();
    expect(frontendConfigRefetch).not.toHaveBeenCalled();
    expect(bitcoinRefetch).toHaveBeenCalledTimes(1);
    expect(qbittorrentRefetch).not.toHaveBeenCalled();
    expect(ipfsRefetch).toHaveBeenCalledTimes(1);
    expect(synologyRefetch).not.toHaveBeenCalled();
    expect(roonRefetch).toHaveBeenCalledTimes(1);
    expect(servicesHealthRefetch).toHaveBeenCalledTimes(1);
  });

  it("refreshes frontend config and qbittorrent when enabled", async () => {
    const adguardRefetch = createRefetch("adguard");
    const torRefetch = createRefetch("tor");
    const frontendConfigRefetch = createRefetch("frontendConfig");
    const bitcoinRefetch = createRefetch("bitcoin");
    const qbittorrentRefetch = createRefetch("qbittorrent");
    const ipfsRefetch = createRefetch("ipfs");
    const synologyRefetch = createRefetch("synology");
    const roonRefetch = createRefetch("roon");
    const servicesHealthRefetch = createRefetch("servicesHealth");

    useQueryMock
      .mockReturnValueOnce({ refetch: adguardRefetch })
      .mockReturnValueOnce({ refetch: torRefetch })
      .mockReturnValueOnce({ refetch: frontendConfigRefetch })
      .mockReturnValueOnce({ refetch: bitcoinRefetch })
      .mockReturnValueOnce({ refetch: qbittorrentRefetch })
      .mockReturnValueOnce({ refetch: ipfsRefetch })
      .mockReturnValueOnce({ refetch: synologyRefetch })
      .mockReturnValueOnce({ refetch: roonRefetch })
      .mockReturnValueOnce({ refetch: servicesHealthRefetch });

    const enabledServices = new Set(["tor", "qbittorrent"]);

    const { refreshEnabledQueries } = useDashboardQueries({
      adguardEnabled: false,
      frontendConfigEnabled: true,
      isServiceEnabled: (serviceName) => enabledServices.has(serviceName),
    });

    await refreshEnabledQueries();

    expect(adguardRefetch).not.toHaveBeenCalled();
    expect(torRefetch).toHaveBeenCalledTimes(1);
    expect(frontendConfigRefetch).toHaveBeenCalledTimes(1);
    expect(bitcoinRefetch).not.toHaveBeenCalled();
    expect(qbittorrentRefetch).toHaveBeenCalledTimes(1);
    expect(ipfsRefetch).not.toHaveBeenCalled();
    expect(synologyRefetch).not.toHaveBeenCalled();
    expect(roonRefetch).not.toHaveBeenCalled();
    expect(servicesHealthRefetch).toHaveBeenCalledTimes(1);
  });
});
