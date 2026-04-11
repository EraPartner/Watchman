import { beforeEach, describe, expect, it, vi } from "vitest";

const useQueryMock = vi.fn();
const useMutationMock = vi.fn();
const useQueryClientMock = vi.fn();

const apiClientMocks = vi.hoisted(() => ({
  getServiceHealth: vi.fn(),
  getServiceStats: vi.fn(),
  getServicesHealth: vi.fn(),
  setAdGuardProtection: vi.fn(),
  clearBackendCache: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: (...args: unknown[]) => useMutationMock(...args),
  useQueryClient: (...args: unknown[]) => useQueryClientMock(...args),
}));

vi.mock("../services/ApiClient", () => ({
  apiClient: apiClientMocks,
}));

import { queryKeys } from "../lib/queryKeys";
import {
  useAdGuardProtectionToggle,
  useAllServicesHealth,
  useClearCache,
  useServiceHealth,
  useServiceStats,
} from "./useServiceHealth";

describe("useServiceHealth hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds service health query with retry backoff and merges options", async () => {
    useQueryMock.mockReturnValue({ data: undefined });

    useServiceHealth("tor", { enabled: false });

    const options = useQueryMock.mock.calls[0][0] as {
      queryKey: unknown[];
      queryFn: () => Promise<unknown>;
      refetchInterval: number;
      staleTime: number;
      retry: number;
      retryDelay: (attempt: number) => number;
      enabled: boolean;
    };

    expect(options.queryKey).toEqual(queryKeys.serviceStatus("tor"));
    expect(options.refetchInterval).toBe(10000);
    expect(options.staleTime).toBe(5000);
    expect(options.retry).toBe(2);
    expect(options.enabled).toBe(false);
    expect(options.retryDelay(0)).toBe(1000);
    expect(options.retryDelay(2)).toBe(4000);
    expect(options.retryDelay(10)).toBe(30000);

    await options.queryFn();
    expect(apiClientMocks.getServiceHealth).toHaveBeenCalledWith("tor");
  });

  it("builds service stats and all-services-health queries", async () => {
    useQueryMock.mockReturnValue({ data: undefined });

    useServiceStats("adguard", false);
    useAllServicesHealth();

    const statsOptions = useQueryMock.mock.calls[0][0] as {
      queryKey: unknown[];
      queryFn: () => Promise<unknown>;
      enabled: boolean;
      refetchInterval: number;
      staleTime: number;
      retry: number;
    };
    const allOptions = useQueryMock.mock.calls[1][0] as {
      queryKey: unknown[];
      queryFn: () => Promise<unknown>;
      refetchInterval: number;
      staleTime: number;
      retry: number;
    };

    expect(statsOptions.queryKey).toEqual(queryKeys.serviceStats("adguard"));
    expect(statsOptions.enabled).toBe(false);
    expect(statsOptions.refetchInterval).toBe(30000);
    expect(statsOptions.staleTime).toBe(15000);
    expect(statsOptions.retry).toBe(1);

    expect(allOptions.queryKey).toEqual(queryKeys.servicesHealth());
    expect(allOptions.refetchInterval).toBe(15000);
    expect(allOptions.staleTime).toBe(7500);
    expect(allOptions.retry).toBe(2);

    await statsOptions.queryFn();
    await allOptions.queryFn();

    expect(apiClientMocks.getServiceStats).toHaveBeenCalledWith("adguard");
    expect(apiClientMocks.getServicesHealth).toHaveBeenCalledTimes(1);
  });

  it("invalidates adguard-related keys on protection toggle success", async () => {
    const invalidateQueries = vi.fn();
    useQueryClientMock.mockReturnValue({ invalidateQueries });
    useMutationMock.mockImplementation((options) => options);

    const mutation = useAdGuardProtectionToggle() as {
      mutationFn: (args: {
        enabled: boolean;
        duration?: number;
      }) => Promise<unknown>;
      onSuccess: () => void;
    };

    await mutation.mutationFn({ enabled: true, duration: 600 });
    expect(apiClientMocks.setAdGuardProtection).toHaveBeenCalledWith(true, 600);

    mutation.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.serviceStatus("adguard"),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.serviceStats("adguard"),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.adguardFull(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.servicesHealth(),
    });
  });

  it("clears cache and invalidates all queries on success", async () => {
    const invalidateQueries = vi.fn();
    useQueryClientMock.mockReturnValue({ invalidateQueries });
    useMutationMock.mockImplementation((options) => options);

    const mutation = useClearCache() as {
      mutationFn: () => Promise<unknown>;
      onSuccess: () => void;
    };

    await mutation.mutationFn();
    expect(apiClientMocks.clearBackendCache).toHaveBeenCalledWith("all");

    mutation.onSuccess();
    expect(invalidateQueries).toHaveBeenCalledWith();
  });
});
