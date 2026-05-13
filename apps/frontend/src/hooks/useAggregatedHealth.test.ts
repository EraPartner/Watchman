import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AggregatedEntry } from "../services/apiClient/types";

const useQueryMock = vi.fn();
const getAggregatedServicesMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("../services/ApiClient", () => ({
  apiClient: {
    getAggregatedServices: (...args: unknown[]) => getAggregatedServicesMock(...args),
  },
}));

import {
  useAggregatedHealth,
  pickHealth,
  pickError,
  type AggregatedHealth,
} from "./useAggregatedHealth";
import { queryKeys } from "../lib/queryKeys";

// ─── pickHealth ───────────────────────────────────────────────────────────────

function makeOkEntry(kind: string, instanceId: string): AggregatedEntry {
  return {
    kind,
    instanceId,
    result: { ok: true, value: { reachable: true, at: "100" } as unknown as import("../services/apiClient/types").HealthSnapshot },
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

describe("pickHealth", () => {
  it("returns undefined when agg is undefined", () => {
    expect(pickHealth(undefined, "bitcoin", "main")).toBeUndefined();
  });

  it("returns snapshot for exact kind+instance match", () => {
    const agg = makeAgg([makeOkEntry("bitcoin", "main")]);
    const result = pickHealth(agg, "bitcoin", "main");
    expect(result?.reachable).toBe(true);
  });

  it("falls back to first entry of kind when instanceId is omitted", () => {
    const agg = makeAgg([makeOkEntry("bitcoin", "node1")]);
    const result = pickHealth(agg, "bitcoin", undefined);
    expect(result?.reachable).toBe(true);
  });

  it("falls back to 'main' when instanceId is undefined", () => {
    const agg = makeAgg([makeOkEntry("bitcoin", "main")]);
    const result = pickHealth(agg, "bitcoin", undefined);
    expect(result?.reachable).toBe(true);
  });

  it("returns undefined when kind not found", () => {
    const agg = makeAgg([makeOkEntry("tor", "main")]);
    expect(pickHealth(agg, "bitcoin", undefined)).toBeUndefined();
  });

  it("maps error entry to reachable:false snapshot", () => {
    const agg = makeAgg([makeErrEntry("bitcoin", "main")]);
    const result = pickHealth(agg, "bitcoin", "main");
    expect(result?.reachable).toBe(false);
  });
});

describe("pickError", () => {
  it("returns undefined when agg is undefined", () => {
    expect(pickError(undefined, "bitcoin", "main")).toBeUndefined();
  });

  it("returns undefined for a healthy service", () => {
    const agg = makeAgg([makeOkEntry("bitcoin", "main")]);
    expect(pickError(agg, "bitcoin", "main")).toBeUndefined();
  });

  it("returns error for an unhealthy service", () => {
    const agg = makeAgg([makeErrEntry("bitcoin", "main")]);
    const err = pickError(agg, "bitcoin", "main");
    expect(err?.code).toBe("UNAVAILABLE");
    expect(err?.message).toBe("down");
  });

  it("falls back to first entry when instance not specified", () => {
    const agg = makeAgg([makeErrEntry("bitcoin", "node1")]);
    const err = pickError(agg, "bitcoin", undefined);
    expect(err?.code).toBe("UNAVAILABLE");
  });
});

// ─── useAggregatedHealth hook wiring ─────────────────────────────────────────

describe("useAggregatedHealth", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls useQuery with correct queryKey and refetchInterval", async () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true });

    useAggregatedHealth(15000);

    expect(useQueryMock).toHaveBeenCalledTimes(1);
    const opts = useQueryMock.mock.calls[0][0] as {
      queryKey: unknown[];
      refetchInterval: number;
      retry: number;
    };
    expect(opts.queryKey).toEqual(queryKeys.servicesHealth());
    expect(opts.refetchInterval).toBe(15000);
    expect(opts.retry).toBe(2);
  });

  it("queryFn transforms raw array into byKey map", async () => {
    getAggregatedServicesMock.mockResolvedValue([
      makeOkEntry("bitcoin", "main"),
      makeOkEntry("tor", "main"),
    ]);
    useQueryMock.mockReturnValue({ data: undefined });

    useAggregatedHealth();

    const opts = useQueryMock.mock.calls[0][0] as {
      queryFn: () => Promise<AggregatedHealth>;
    };
    const result = await opts.queryFn();
    expect(result.entries).toHaveLength(2);
    expect(result.byKey.get("bitcoin::main")).toBeDefined();
    expect(result.byKey.get("tor::main")).toBeDefined();
  });

  it("queryFn handles non-array response gracefully", async () => {
    getAggregatedServicesMock.mockResolvedValue(null);
    useQueryMock.mockReturnValue({ data: undefined });

    useAggregatedHealth();

    const opts = useQueryMock.mock.calls[0][0] as {
      queryFn: () => Promise<AggregatedHealth>;
    };
    const result = await opts.queryFn();
    expect(result.entries).toHaveLength(0);
    expect(result.byKey.size).toBe(0);
  });

  it("queryFn skips invalid entries", async () => {
    getAggregatedServicesMock.mockResolvedValue([
      null,
      { kind: 123, instanceId: "main", result: { ok: true, value: {} } },
      makeOkEntry("tor", "main"),
    ]);
    useQueryMock.mockReturnValue({ data: undefined });

    useAggregatedHealth();

    const opts = useQueryMock.mock.calls[0][0] as {
      queryFn: () => Promise<AggregatedHealth>;
    };
    const result = await opts.queryFn();
    expect(result.byKey.has("tor::main")).toBe(true);
  });
});
