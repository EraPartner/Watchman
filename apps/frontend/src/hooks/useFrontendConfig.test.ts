import { beforeEach, describe, expect, it, vi } from "vitest";

const useQueryMock = vi.fn();
const getFrontendConfigMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("../services/ApiClient", () => ({
  apiClient: {
    getFrontendConfig: (...args: unknown[]) => getFrontendConfigMock(...args),
  },
}));

import { queryKeys } from "../lib/queryKeys";
import { useFrontendConfig } from "./useFrontendConfig";

describe("useFrontendConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("configures frontend config query with refresh policy", async () => {
    useQueryMock.mockReturnValue({ data: { enabledServices: [] } });

    const queryResult = useFrontendConfig();

    expect(queryResult).toEqual({ data: { enabledServices: [] } });
    expect(useQueryMock).toHaveBeenCalledTimes(1);

    const options = useQueryMock.mock.calls[0][0] as {
      queryKey: unknown[];
      queryFn: () => Promise<unknown>;
      staleTime: number;
      refetchInterval: number;
      retry: number;
    };

    expect(options.queryKey).toEqual(queryKeys.frontendConfig());
    expect(options.staleTime).toBe(60000);
    expect(options.refetchInterval).toBe(60000);
    expect(options.retry).toBe(1);

    await options.queryFn();
    expect(getFrontendConfigMock).toHaveBeenCalledTimes(1);
  });
});
