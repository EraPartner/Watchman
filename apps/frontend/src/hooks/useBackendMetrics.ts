import { useQuery } from "@tanstack/react-query";
import { sharedCore } from "../services/ApiClient";
import { queryKeys } from "../lib/queryKeys";

export interface BreakerMetrics {
  // mirrors the backend BreakerState enum (infra/circuitBreaker/breaker.ts)
  state: "closed" | "open" | "half-open";
  successes: number;
  failures: number;
  rejects: number;
  trips: number;
  openedAt: number | null;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
}

export interface ProcessMetrics {
  uptimeSec: number;
  rss: number;
  heapUsed: number;
}

export interface BackendMetrics {
  breakers: Record<string, BreakerMetrics>;
  poller: { tracked: number } | null;
  cache: Record<string, CacheStats>;
  errors?: { total: number; byService: Record<string, number> };
  process: ProcessMetrics;
}

export const useBackendMetrics = () => {
  return useQuery<BackendMetrics>({
    queryKey: queryKeys.metrics(),
    queryFn: () => sharedCore.request<BackendMetrics>("/metrics"),
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 1,
  });
};

export function summarizeBreakers(
  breakers: Record<string, BreakerMetrics> | undefined
): { open: number; halfOpen: number; closed: number; total: number } {
  if (!breakers) return { open: 0, halfOpen: 0, closed: 0, total: 0 };
  let open = 0;
  let halfOpen = 0;
  let closed = 0;
  const values = Object.values(breakers);
  for (const b of values) {
    if (b.state === "open") open += 1;
    else if (b.state === "half-open") halfOpen += 1;
    else closed += 1;
  }
  return { open, halfOpen, closed, total: values.length };
}
