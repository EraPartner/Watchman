import { useQuery } from "@tanstack/react-query";
import { apiClient, FrontendConfig } from "../services/ApiClient";
import { queryKeys } from "../lib/queryKeys";

export const useFrontendConfig = () => {
  return useQuery<FrontendConfig>({
    queryKey: queryKeys.frontendConfig(),
    queryFn: () => apiClient.getFrontendConfig(),
    staleTime: 60000,
    refetchInterval: 60000,
    retry: 1,
  });
};
