import { beforeEach, describe, expect, it, vi } from "vitest";

const useQueryMock = vi.fn();
const sharedCoreMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("../services/ApiClient", () => ({
  sharedCore: {
    request: (...args: unknown[]) => sharedCoreMock(...args),
  },
}));

import { useBackendMetrics, summarizeBreakers } from "./useBackendMetrics";
import type { BreakerMetrics } from "./useBackendMetrics";
import { queryKeys } from "../lib/queryKeys";

// ─── summarizeBreakers ────────────────────────────────────────────────────────

function makeBreaker(state: BreakerMetrics["state"]): BreakerMetrics {
  return { state, successes: 1, failures: 0, rejects: 0, trips: 0 };
}

describe("summarizeBreakers", () => {
  it("returns zeros for undefined input", () => {
    expect(summarizeBreakers(undefined)).toEqual({
      open: 0,
      halfOpen: 0,
      closed: 0,
      total: 0,
    });
  });

  it("returns zeros for empty record", () => {
    expect(summarizeBreakers({})).toEqual({
      open: 0,
      halfOpen: 0,
      closed: 0,
      total: 0,
    });
  });

  it("counts a single closed breaker", () => {
    const result = summarizeBreakers({ a: makeBreaker("closed") });
    expect(result).toEqual({ open: 0, halfOpen: 0, closed: 1, total: 1 });
  });

  it("counts a single open breaker", () => {
    const result = summarizeBreakers({ a: makeBreaker("open") });
    expect(result).toEqual({ open: 1, halfOpen: 0, closed: 0, total: 1 });
  });

  it("counts a single half_open breaker", () => {
    const result = summarizeBreakers({ a: makeBreaker("half_open") });
    expect(result).toEqual({ open: 0, halfOpen: 1, closed: 0, total: 1 });
  });

  it("counts mixed breaker states correctly", () => {
    const breakers = {
      a: makeBreaker("closed"),
      b: makeBreaker("open"),
      c: makeBreaker("half_open"),
      d: makeBreaker("closed"),
      e: makeBreaker("open"),
    };
    expect(summarizeBreakers(breakers)).toEqual({
      open: 2,
      halfOpen: 1,
      closed: 2,
      total: 5,
    });
  });
});

// ─── useBackendMetrics hook wiring ────────────────────────────────────────────

describe("useBackendMetrics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls useQuery with correct queryKey and intervals", () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: false });

    useBackendMetrics();

    expect(useQueryMock).toHaveBeenCalledTimes(1);
    const opts = useQueryMock.mock.calls[0][0] as {
      queryKey: unknown[];
      refetchInterval: number;
      staleTime: number;
      retry: number;
    };
    expect(opts.queryKey).toEqual(queryKeys.metrics());
    expect(opts.refetchInterval).toBe(30000);
    expect(opts.staleTime).toBe(15000);
    expect(opts.retry).toBe(1);
  });

  it("queryFn calls sharedCore.request with /metrics", async () => {
    const mockData = {
      breakers: {},
      poller: { tracked: 3 },
      cache: {},
      process: { uptimeSec: 100, rss: 1024, heapUsed: 512 },
    };
    sharedCoreMock.mockResolvedValue(mockData);
    useQueryMock.mockReturnValue({ data: undefined });

    useBackendMetrics();

    const opts = useQueryMock.mock.calls[0][0] as {
      queryFn: () => Promise<unknown>;
    };
    const result = await opts.queryFn();
    expect(sharedCoreMock).toHaveBeenCalledWith("/metrics");
    expect(result).toEqual(mockData);
  });
});
