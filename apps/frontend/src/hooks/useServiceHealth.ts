import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../services/ApiClient";
import { queryKeys } from "../lib/queryKeys";

// Service health hook with React Query
export const useServiceHealth = (serviceName: string, options = {}) => {
  return useQuery({
    queryKey: queryKeys.serviceStatus(serviceName),
    queryFn: async () => apiClient.getServiceHealth(serviceName),
    refetchInterval: 10000, // 10 seconds
    staleTime: 5000, // 5 seconds
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    ...options,
  });
};

// Service stats hook with React Query
export const useServiceStats = (serviceName: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.serviceStats(serviceName),
    queryFn: async () => apiClient.getServiceStats(serviceName),
    refetchInterval: 30000, // 30 seconds for stats
    staleTime: 15000, // 15 seconds
    enabled,
    retry: 1,
  });
};

// All services health hook
export const useAllServicesHealth = () => {
  return useQuery({
    queryKey: queryKeys.servicesHealth(),
    queryFn: async () => apiClient.getServicesHealth(),
    refetchInterval: 15000, // 15 seconds
    staleTime: 7500, // 7.5 seconds
    retry: 2,
  });
};

// AdGuard protection toggle mutation
export const useAdGuardProtectionToggle = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      enabled,
      duration,
    }: {
      enabled: boolean;
      duration?: number;
    }) => {
      return apiClient.setAdGuardProtection(enabled, duration);
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.serviceStatus("adguard"),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.serviceStats("adguard"),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.adguardFull() });
      queryClient.invalidateQueries({ queryKey: queryKeys.servicesHealth() });
    },
  });
};

// Cache clear mutation
export const useClearCache = () => {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, void>({
    mutationFn: async () => {
      return apiClient.clearBackendCache("all");
    },
    onSuccess: () => {
      // Refetch all queries after cache clear
      queryClient.invalidateQueries();
    },
  });
};
