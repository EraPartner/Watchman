import { beforeEach, describe, expect, it, vi } from "vitest";

const useQueryMock = vi.fn();
const isServiceEnabledMock = vi.fn();
const buildHrefMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("./useEnabledServices", () => ({
  useEnabledServices: () => ({
    isServiceEnabled: (...args: unknown[]) => isServiceEnabledMock(...args),
  }),
}));

vi.mock("../lib/url", () => ({
  buildHref: (...args: unknown[]) => buildHrefMock(...args),
}));

vi.mock("../services/ApiClient", () => ({
  apiClient: {
    getServiceHealth: vi.fn(),
    getServiceStats: vi.fn(),
  },
}));

import { queryKeys } from "../lib/queryKeys";
import { usePingServiceCard } from "./usePingServiceCard";

describe("usePingServiceCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildHrefMock.mockReturnValue("https://service.local");
  });

  it("disables health/stats queries when service is not enabled", () => {
    isServiceEnabledMock.mockReturnValue(false);
    useQueryMock
      .mockReturnValueOnce({ isLoading: false, data: undefined })
      .mockReturnValueOnce({ isLoading: false, data: undefined });

    const result = usePingServiceCard({
      serviceKey: "roon",
      instanceId: "roon_main",
      refetchInterval: 12345,
    });

    const statusOptions = useQueryMock.mock.calls[0][0] as {
      queryKey: unknown[];
      enabled: boolean;
      refetchInterval: number;
    };
    const statsOptions = useQueryMock.mock.calls[1][0] as {
      queryKey: unknown[];
      enabled: boolean;
      refetchInterval: number;
    };

    expect(statusOptions.queryKey).toEqual(
      queryKeys.serviceStatus("roon", "roon_main")
    );
    expect(statsOptions.queryKey).toEqual(
      queryKeys.serviceStats("roon", "roon_main")
    );
    expect(statusOptions.enabled).toBe(false);
    expect(statsOptions.enabled).toBe(false);
    expect(statusOptions.refetchInterval).toBe(12345);
    expect(statsOptions.refetchInterval).toBe(12345);

    expect(result.loading).toBe(false);
    expect(result.isOnline).toBe(false);
    expect(result.hasError).toBe(false);
    expect(result.hostValue).toBe(null);
    expect(result.errorMessage).toBeUndefined();
  });

  it("derives online state, host/url, ping and ports from status/stats", () => {
    isServiceEnabledMock.mockReturnValue(true);
    useQueryMock
      .mockReturnValueOnce({
        isLoading: true,
        data: {
          status: "offline",
          data: { host: "status.local", ping: null },
        },
      })
      .mockReturnValueOnce({
        isLoading: true,
        data: {
          status: "online",
          data: {
            host: "stats.local",
            ping: true,
            ports: [{ port: 9735, open: true }],
          },
        },
      });

    const result = usePingServiceCard({
      serviceKey: "tor",
      instanceId: "tor_main",
      refetchInterval: 5000,
    });

    expect(result.loading).toBe(true);
    expect(result.isOnline).toBe(true);
    expect(result.hasError).toBe(false);
    expect(result.hostValue).toBe("status.local");
    expect(buildHrefMock).toHaveBeenCalledWith("status.local");
    expect(result.hostHref).toBe("https://service.local");
    expect(result.ping).toBe(true);
    expect(result.ports).toEqual([{ port: 9735, open: true }]);
  });

  it("derives error state and fallback error message", () => {
    isServiceEnabledMock.mockReturnValue(true);
    useQueryMock
      .mockReturnValueOnce({
        isLoading: false,
        data: {
          status: "error",
          error: "status error",
          data: {},
        },
      })
      .mockReturnValueOnce({
        isLoading: false,
        data: {
          status: "offline",
          error: "stats error",
          data: {},
        },
      });

    const result = usePingServiceCard({
      serviceKey: "synology",
      instanceId: "synology_main",
    });

    expect(result.hasError).toBe(true);
    expect(result.isOnline).toBe(false);
    expect(result.errorMessage).toBe("status error");
  });
});
