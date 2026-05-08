import { beforeEach, describe, expect, it, vi } from "vitest";

const useQueryMock = vi.fn();
const getKindsMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("../services/ApiClient", () => ({
  apiClient: {
    getKinds: (...args: unknown[]) => getKindsMock(...args),
  },
}));

import { queryKeys } from "../lib/queryKeys";
import { useEnabledServices } from "./useEnabledServices";

describe("useEnabledServices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty enabledServices and disabled checks before config loads", () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: undefined,
    });

    const result = useEnabledServices();

    expect(result.enabledServices).toEqual([]);
    expect(result.isServiceEnabled("adguard")).toBe(false);
    expect(result.isLoading).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("matches enabled services case-insensitively", () => {
    useQueryMock.mockReturnValue({
      data: ["adguard", "tor", "bitcoin"],
      isLoading: false,
      error: undefined,
    });

    const result = useEnabledServices();

    expect(result.isServiceEnabled("AdGuard")).toBe(true);
    expect(result.isServiceEnabled("TOR")).toBe(true);
    expect(result.isServiceEnabled("qbittorrent")).toBe(false);
  });

  it("wires query options for frontend config cache behavior", async () => {
    useQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      error: undefined,
    });
    getKindsMock.mockResolvedValue([]);

    useEnabledServices();

    expect(useQueryMock).toHaveBeenCalledTimes(1);
    const options = useQueryMock.mock.calls[0][0] as {
      queryKey: unknown[];
      queryFn: () => Promise<unknown>;
      staleTime: number;
      retry: number;
    };

    expect(options.queryKey).toEqual(queryKeys.frontendConfig());
    expect(options.staleTime).toBe(Infinity);
    expect(options.retry).toBe(2);

    await options.queryFn();
    expect(getKindsMock).toHaveBeenCalledTimes(1);
  });
});
