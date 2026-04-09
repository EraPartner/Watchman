import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../services/ApiClient";
import { queryKeys } from "../lib/queryKeys";

/**
 * Hook to check which services are enabled via ENABLED_SERVICES environment variable
 * @returns Object with enabledServices array and isServiceEnabled helper function
 */
export function useEnabledServices() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.frontendConfig(),
    queryFn: () => apiClient.getFrontendConfig(),
    staleTime: Infinity, // Config rarely changes
    retry: 2,
  });

  const enabledServices = data?.enabledServices || [];

  const isServiceEnabled = (serviceName: string): boolean => {
    if (!data?.enabledServices) {
      // If data not loaded yet, default to disabled to avoid premature requests
      return false;
    }
    return enabledServices.includes(serviceName.toLowerCase());
  };

  return {
    enabledServices,
    isServiceEnabled,
    isLoading,
    error,
  };
}
