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

function aggregatedKey(kind: string, instanceId: string): string {
  return `${kind}::${instanceId}`;
}

export const useAggregatedHealth = (refetchInterval = 10000) => {
  return useQuery<AggregatedHealth>({
    queryKey: queryKeys.servicesHealth(),
    queryFn: async () => {
      const raw = await apiClient.getAggregatedServices();
      const entries: AggregatedEntry[] = Array.isArray(raw) ? raw : [];
      const byKey = new Map<string, AggregatedEntry>();
      for (const entry of entries) {
        if (!entry || typeof entry !== "object") continue;
        if (typeof entry.kind !== "string" || typeof entry.instanceId !== "string") {
          continue;
        }
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

function resultToSnapshot(
  entry: AggregatedEntry
): HealthSnapshot | undefined {
  if (entry.result.ok) return entry.result.value;
  return {
    reachable: false,
    message: entry.result.error?.message,
    at: String(Date.now()),
  } as unknown as HealthSnapshot;
}

export function pickError(
  agg: AggregatedHealth | undefined,
  kind: string,
  instanceId: string | undefined
): { code: string; message: string } | undefined {
  if (!agg) return undefined;
  const id = instanceId ?? "main";
  const exact = agg.byKey.get(aggregatedKey(kind, id));
  const entry = exact ?? agg.entries.find((e) => e.kind === kind);
  if (entry && !entry.result.ok) return entry.result.error;
  return undefined;
}
