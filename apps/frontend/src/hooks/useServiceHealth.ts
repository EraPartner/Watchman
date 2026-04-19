import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../services/ApiClient";
import { queryKeys } from "../lib/queryKeys";

// Service health hook (v2): kind + optional instance.
export const useServiceHealth = (
  kind: string,
  instance?: string,
  options = {}
) => {
  return useQuery({
    queryKey: instance
      ? [...queryKeys.serviceStatus(kind), instance]
      : queryKeys.serviceStatus(kind),
    queryFn: async () => apiClient.getServiceHealth(kind, instance),
    refetchInterval: 10000,
    staleTime: 5000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    ...options,
  });
};

// Service stats hook (v2): kind + optional instance.
export const useServiceStats = (
  kind: string,
  instance?: string,
  enabled = true
) => {
  return useQuery({
    queryKey: instance
      ? [...queryKeys.serviceStats(kind), instance]
      : queryKeys.serviceStats(kind),
    queryFn: async () => apiClient.getServiceStats(kind, instance),
    refetchInterval: 30000,
    staleTime: 15000,
    enabled,
    retry: 1,
  });
};

// All services health — v2 aggregated endpoint.
export const useAllServicesHealth = () => {
  return useQuery({
    queryKey: queryKeys.servicesHealth(),
    queryFn: async () => apiClient.getAggregatedServices(),
    refetchInterval: 15000,
    staleTime: 7500,
    retry: 2,
  });
};
