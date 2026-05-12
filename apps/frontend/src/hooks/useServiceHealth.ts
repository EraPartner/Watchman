import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../services/ApiClient";
import { queryKeys } from "../lib/queryKeys";
import { recordStats } from "../lib/metricHistory";
import {
  pickError,
  pickHealth,
  useAggregatedHealth,
} from "./useAggregatedHealth";
import type {
  HealthSnapshot,
  StatsSnapshot,
} from "../services/apiClient/types";
import { parseApiErrorCode } from "../services/apiClient/types";

interface AggregatedHealthResult {
  data: HealthSnapshot | undefined;
  isLoading: boolean;
  error: { code: string; message: string } | undefined;
}

/** Error subclass thrown from useServiceStats's queryFn carrying the parsed
 *  API error code so the tile can branch on it without substring-matching. */
export class StatsApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "StatsApiError";
    this.code = code;
  }
}

/**
 * Tile-friendly health hook backed by the aggregated /services endpoint.
 * One request per refetch interval, regardless of how many tiles render.
 */
export const useServiceHealth = (
  kind: string,
  instance?: string
): AggregatedHealthResult => {
  const { data, isLoading } = useAggregatedHealth();
  return {
    data: pickHealth(data, kind, instance),
    isLoading: isLoading && !data,
    error: pickError(data, kind, instance),
  };
};

/**
 * Stats hook — per-tile fetch. Tiles call this only when a renderer needs
 * stats for their summary; the detail sheet always calls it. Records
 * snapshots into the in-memory metric history ring buffer for sparklines.
 */
export const useServiceStats = (
  kind: string,
  instance?: string,
  enabled = true,
  trackedMetrics: ReadonlyArray<string> = []
) => {
  const query = useQuery<StatsSnapshot, StatsApiError>({
    queryKey: instance
      ? [...queryKeys.serviceStats(kind), instance]
      : queryKeys.serviceStats(kind),
    queryFn: async () => {
      try {
        return await apiClient.getServiceStats(kind, instance);
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        const { code, message } = parseApiErrorCode(raw);
        throw new StatsApiError(code, message);
      }
    },
    refetchInterval: 30000,
    staleTime: 15000,
    enabled,
    retry: 1,
  });

  useEffect(() => {
    if (!query.data) return;
    if (trackedMetrics.length === 0) return;
    const at =
      typeof query.data.at === "number"
        ? query.data.at
        : Number(query.data.at) || Date.now();
    recordStats(
      kind,
      instance,
      query.data.metrics as Record<string, unknown>,
      trackedMetrics,
      at
    );
  }, [query.data, kind, instance, trackedMetrics]);

  return query;
};

/** Convenience wrapper around the aggregated query for components that
 * want the raw entries (e.g. the global summary). */
export { useAggregatedHealth } from "./useAggregatedHealth";

export const useAllServicesHealth = useAggregatedHealth;
