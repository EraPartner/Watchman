import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AggregatedHealth } from "./useAggregatedHealth";
import type { AggregatedEntry } from "../services/apiClient/types";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const useQueryMock = vi.fn();
const getServiceStatsMock = vi.fn();

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useEffect: vi.fn() };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("../services/ApiClient", () => ({
  apiClient: {
    getAggregatedServices: vi.fn(async () => []),
    getServiceStats: (...args: unknown[]) => getServiceStatsMock(...args),
  },
}));

vi.mock("../lib/metricHistory", () => ({
  recordStats: vi.fn(),
}));

import { useServiceHealth, useServiceStats, StatsApiError } from "./useServiceHealth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOkEntry(kind: string, instanceId: string): AggregatedEntry {
  return {
    kind,
    instanceId,
    result: {
      ok: true,
      value: { reachable: true, at: "100" } as unknown as import("../services/apiClient/types").HealthSnapshot,
    },
  };
}

function makeErrEntry(kind: string, instanceId: string): AggregatedEntry {
  return {
    kind,
    instanceId,
    result: { ok: false, error: { code: "UNAVAILABLE", message: "down" } },
  };
}

function makeAgg(entries: AggregatedEntry[]): AggregatedHealth {
  const byKey = new Map<string, AggregatedEntry>();
  for (const e of entries) byKey.set(`${e.kind}::${e.instanceId}`, e);
  return { entries, byKey, fetchedAt: Date.now() };
}

// ─── useServiceHealth ─────────────────────────────────────────────────────────

describe("useServiceHealth", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns undefined data + isLoading true when no aggregated data", () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true });

    const result = useServiceHealth("bitcoin", "main");

    expect(result.data).toBeUndefined();
    expect(result.isLoading).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns health snapshot when service is healthy", () => {
    const agg = makeAgg([makeOkEntry("bitcoin", "main")]);
    useQueryMock.mockReturnValue({ data: agg, isLoading: false });

    const result = useServiceHealth("bitcoin", "main");

    expect(result.data?.reachable).toBe(true);
    expect(result.isLoading).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it("returns error when service is unhealthy", () => {
    const agg = makeAgg([makeErrEntry("bitcoin", "main")]);
    useQueryMock.mockReturnValue({ data: agg, isLoading: false });

    const result = useServiceHealth("bitcoin", "main");

    expect(result.data?.reachable).toBe(false);
    expect(result.error?.code).toBe("UNAVAILABLE");
    expect(result.error?.message).toBe("down");
  });

  it("isLoading is false when data is available even if still fetching", () => {
    const agg = makeAgg([makeOkEntry("tor", "main")]);
    useQueryMock.mockReturnValue({ data: agg, isLoading: true });

    const result = useServiceHealth("tor", "main");

    expect(result.isLoading).toBe(false);
  });

  it("falls back to first entry when instance not specified", () => {
    const agg = makeAgg([makeOkEntry("bitcoin", "node1")]);
    useQueryMock.mockReturnValue({ data: agg, isLoading: false });

    const result = useServiceHealth("bitcoin");

    expect(result.data?.reachable).toBe(true);
  });
});

// ─── StatsApiError ────────────────────────────────────────────────────────────

describe("StatsApiError", () => {
  it("has correct name, code, and message", () => {
    const err = new StatsApiError("TIMEOUT", "timed out");
    expect(err.name).toBe("StatsApiError");
    expect(err.code).toBe("TIMEOUT");
    expect(err.message).toBe("timed out");
    expect(err instanceof Error).toBe(true);
  });
});

// ─── useServiceStats ──────────────────────────────────────────────────────────

describe("useServiceStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls useQuery with kind-only queryKey when no instance given", () => {
    useQueryMock.mockReturnValue({ data: undefined });

    useServiceStats("bitcoin");

    const opts = useQueryMock.mock.calls[0][0] as { queryKey: unknown[] };
    expect(opts.queryKey).not.toContain(undefined);
    expect(opts.queryKey[0]).toBe("bitcoin");
  });

  it("appends instance to queryKey when provided", () => {
    useQueryMock.mockReturnValue({ data: undefined });

    useServiceStats("bitcoin", "node1");

    const opts = useQueryMock.mock.calls[0][0] as { queryKey: unknown[] };
    expect(opts.queryKey).toContain("node1");
  });

  it("passes enabled flag to useQuery", () => {
    useQueryMock.mockReturnValue({ data: undefined });

    useServiceStats("bitcoin", undefined, false);

    const opts = useQueryMock.mock.calls[0][0] as { enabled: boolean };
    expect(opts.enabled).toBe(false);
  });

  it("queryFn calls getServiceStats and returns data", async () => {
    const stats = { metrics: { blockHeight: 800000 }, at: Date.now() };
    getServiceStatsMock.mockResolvedValue(stats);
    useQueryMock.mockReturnValue({ data: undefined });

    useServiceStats("bitcoin", "main");

    const opts = useQueryMock.mock.calls[0][0] as {
      queryFn: () => Promise<unknown>;
    };
    const result = await opts.queryFn();
    expect(result).toEqual(stats);
  });

  it("queryFn wraps errors in StatsApiError", async () => {
    getServiceStatsMock.mockRejectedValue(new Error("UNAVAILABLE: host down"));
    useQueryMock.mockReturnValue({ data: undefined });

    useServiceStats("bitcoin");

    const opts = useQueryMock.mock.calls[0][0] as {
      queryFn: () => Promise<unknown>;
    };
    await expect(opts.queryFn()).rejects.toBeInstanceOf(StatsApiError);
  });
});
