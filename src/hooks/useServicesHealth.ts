import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/ApiClient';
import { APP_CONFIG } from '../lib/constants';

export const useServicesHealth = () => {
  return useQuery({
    queryKey: ['services-health'],
    queryFn: () => apiClient.getServicesHealth(),
    staleTime: 5000,
    refetchInterval: APP_CONFIG.ADGUARD_REFRESH_INTERVAL,
    retry: 1,
  });
};

export const useFrontendConfig = () => {
  return useQuery({
    queryKey: ['frontend-config'],
    queryFn: () => apiClient.getFrontendConfig(),
    staleTime: 60000,
    refetchInterval: 60000,
    retry: 1,
  });
};