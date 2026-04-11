import { beforeEach, describe, expect, it, vi } from "vitest";

const useQueryMock = vi.fn();
const getServiceInstancesMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("../services/ApiClient", () => ({
  apiClient: {
    getServiceInstances: (...args: unknown[]) =>
      getServiceInstancesMock(...args),
  },
}));

import { queryKeys } from "../lib/queryKeys";
import { useServiceInstances } from "./useServiceInstances";

describe("useServiceInstances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty helpers when instance data is missing", () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      refetch: vi.fn(),
    });

    const result = useServiceInstances();

    expect(result.getInstances("tor")).toEqual([]);
    expect(result.getInstanceCount("tor")).toBe(0);
    expect(result.hasMultipleInstances("tor")).toBe(false);
  });

  it("resolves instances, counts, and multi-instance state", () => {
    useQueryMock.mockReturnValue({
      data: {
        instances: {
          tor: {
            count: 2,
            instances: [
              { id: "tor_1", type: "tor" },
              { id: "tor_2", type: "tor" },
            ],
          },
          adguard: {
            count: 1,
            instances: [{ id: "adguard_main", type: "adguard" }],
          },
        },
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      isLoading: false,
      refetch: vi.fn(),
    });

    const result = useServiceInstances();

    expect(result.getInstances("tor")).toEqual([
      { id: "tor_1", type: "tor" },
      { id: "tor_2", type: "tor" },
    ]);
    expect(result.getInstanceCount("tor")).toBe(2);
    expect(result.hasMultipleInstances("tor")).toBe(true);

    expect(result.getInstanceCount("adguard")).toBe(1);
    expect(result.hasMultipleInstances("adguard")).toBe(false);
  });

  it("sets query options for service instance polling", async () => {
    useQueryMock.mockReturnValue({ data: undefined });

    useServiceInstances();

    expect(useQueryMock).toHaveBeenCalledTimes(1);
    const options = useQueryMock.mock.calls[0][0] as {
      queryKey: unknown[];
      queryFn: () => Promise<unknown>;
      refetchInterval: number;
      retry: number;
    };

    expect(options.queryKey).toEqual(queryKeys.servicesInstances());
    expect(options.refetchInterval).toBe(60000);
    expect(options.retry).toBe(1);

    await options.queryFn();
    expect(getServiceInstancesMock).toHaveBeenCalledTimes(1);
  });
});
