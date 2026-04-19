import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { apiClient } from "../services/ApiClient";
import { queryKeys } from "../lib/queryKeys";
import type {
  HistoryPayload,
  HistoryResolution,
} from "../services/apiClient/types";

export type HistoryRange = "1h" | "24h" | "7d" | "30d";

const RANGE_MS: Record<HistoryRange, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export interface UseServiceHistoryParams {
  instance?: string;
  metric: string;
  range: HistoryRange;
  resolution?: HistoryResolution;
  enabled?: boolean;
}

export const useServiceHistory = (
  kind: string,
  params: UseServiceHistoryParams
) => {
  const { instance, metric, range, resolution, enabled = true } = params;

  return useQuery<HistoryPayload>({
    queryKey: queryKeys.serviceHistory(kind, {
      instance,
      metric,
      range,
      resolution,
    }),
    queryFn: async () => {
      const to = Date.now();
      const from = to - RANGE_MS[range];
      return apiClient.getServiceHistory(kind, {
        metric,
        from,
        to,
        instance,
        resolution,
      });
    },
    enabled: enabled && !!kind && !!metric,
    staleTime: 30_000,
    refetchInterval: range === "1h" ? 60_000 : false,
    placeholderData: keepPreviousData,
    retry: 1,
  });
};
