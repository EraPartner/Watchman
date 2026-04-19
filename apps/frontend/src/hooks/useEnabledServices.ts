import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../services/ApiClient";
import { queryKeys } from "../lib/queryKeys";

/**
 * Hook to check which service kinds are configured in the v2 backend.
 * Derived from /kinds (list of registered service kinds).
 */
export function useEnabledServices() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.frontendConfig(),
    queryFn: () => apiClient.getKinds(),
    staleTime: Infinity,
    retry: 2,
  });

  const enabledServices = data ?? [];

  const isServiceEnabled = (serviceName: string): boolean => {
    if (!data) return false;
    return enabledServices.includes(serviceName.toLowerCase());
  };

  return {
    enabledServices,
    isServiceEnabled,
    isLoading,
    error,
  };
}
