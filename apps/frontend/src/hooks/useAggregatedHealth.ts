import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../services/ApiClient";
import { queryKeys } from "../lib/queryKeys";
import type {
  AggregatedEntry,
  HealthSnapshot,
} from "../services/apiClient/types";

export interface AggregatedHealth {
  entries: ReadonlyArray<AggregatedEntry>;
  byKey: ReadonlyMap<string, AggregatedEntry>;
  fetchedAt: number;
}

const EMPTY: AggregatedHealth = {
  entries: [],
  byKey: new Map(),
  fetchedAt: 0,
};

function isAggregatedEntry(v: unknown): v is AggregatedEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e["kind"] === "string" &&
    typeof e["instanceId"] === "string" &&
    typeof e["result"] === "object" &&
    e["result"] !== null
  );
}

function aggregatedKey(kind: string, instanceId: string): string {
  return `${kind}::${instanceId}`;
}

export const useAggregatedHealth = (refetchInterval = 10000) => {
  return useQuery<AggregatedHealth>({
    queryKey: queryKeys.servicesHealth(),
    queryFn: async () => {
      // The response is untyped JSON: keep only well-formed entries.
      const raw: unknown = await apiClient.getAggregatedServices();
      const entries = Array.isArray(raw) ? raw.filter(isAggregatedEntry) : [];
      const byKey = new Map<string, AggregatedEntry>();
      for (const entry of entries) {
        byKey.set(aggregatedKey(entry.kind, entry.instanceId), entry);
      }
      return { entries, byKey, fetchedAt: Date.now() };
    },
    refetchInterval,
    staleTime: refetchInterval / 2,
    retry: 2,
    placeholderData: (prev) => prev ?? EMPTY,
  });
};

export function pickHealth(
  agg: AggregatedHealth | undefined,
  kind: string,
  instanceId: string | undefined
): HealthSnapshot | undefined {
  if (!agg) return undefined;
  const id = instanceId ?? "main";
  const exact = agg.byKey.get(aggregatedKey(kind, id));
  if (exact) return resultToSnapshot(exact);
  // fall back to the first entry of the kind when instance isn't pinned
  if (!instanceId) {
    const first = agg.entries.find((e) => e.kind === kind);
    if (first) return resultToSnapshot(first);
  }
  return undefined;
}

function resultToSnapshot(entry: AggregatedEntry): HealthSnapshot | undefined {
  if (entry.result.ok) return entry.result.value;
  const snapshot: HealthSnapshot = {
    reachable: false,
    at: Date.now(),
  };
  snapshot.message = entry.result.error.message;
  return snapshot;
}

export function pickError(
  agg: AggregatedHealth | undefined,
  kind: string,
  instanceId: string | undefined
): { code: string; message: string } | undefined {
  if (!agg) return undefined;
  const id = instanceId ?? "main";
  const exact = agg.byKey.get(aggregatedKey(kind, id));
  // Same fallback rule as pickHealth: a pinned instance must never show
  // another instance's error.
  const entry =
    exact ?? (instanceId ? undefined : agg.entries.find((e) => e.kind === kind));
  if (entry && !entry.result.ok) return entry.result.error;
  return undefined;
}

/**
 * When the aggregated health poll is failing but React Query still holds an
 * earlier successful result, return that result's fetch time so the UI can
 * flag the tiles as stale. Returns undefined while the poll is healthy, and
 * when there is no real data yet (the empty placeholder has fetchedAt 0).
 */
export function staleHealthSince(query: {
  isError?: boolean | undefined;
  data?: AggregatedHealth | undefined;
}): number | undefined {
  if (!query.isError) return undefined;
  const fetchedAt = query.data?.fetchedAt ?? 0;
  return fetchedAt > 0 ? fetchedAt : undefined;
}
