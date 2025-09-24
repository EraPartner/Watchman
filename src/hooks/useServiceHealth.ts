import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { env } from '../lib/env';

const API_BASE_URL = env.get('VITE_BACKEND_URL') || 'http://localhost:3001';

// Service health hook with React Query
export const useServiceHealth = (serviceName: string, options = {}) => {
  return useQuery({
    queryKey: ['service-health', serviceName],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/${serviceName}/status`);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${serviceName} status`);
      }
      return response.json();
    },
    refetchInterval: 10000, // 10 seconds
    staleTime: 5000, // 5 seconds
    retry: 2,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
    ...options
  });
};

// Service stats hook with React Query
export const useServiceStats = (serviceName: string, enabled = true) => {
  return useQuery({
    queryKey: ['service-stats', serviceName],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/${serviceName}/stats`);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${serviceName} stats`);
      }
      return response.json();
    },
    refetchInterval: 30000, // 30 seconds for stats
    staleTime: 15000, // 15 seconds
    enabled,
    retry: 1,
  });
};

// All services health hook
export const useAllServicesHealth = () => {
  return useQuery({
    queryKey: ['all-services-health'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/services/health`);
      if (!response.ok) {
        throw new Error('Failed to fetch services health');
      }
      return response.json();
    },
    refetchInterval: 15000, // 15 seconds
    staleTime: 7500, // 7.5 seconds
    retry: 2,
  });
};

// AdGuard protection toggle mutation
export const useAdGuardProtectionToggle = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ enabled, duration }: { enabled: boolean; duration?: number }) => {
      const response = await fetch(`${API_BASE_URL}/api/adguard/protection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled, duration }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to toggle AdGuard protection');
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['service-health', 'adguard'] });
      queryClient.invalidateQueries({ queryKey: ['service-stats', 'adguard'] });
      queryClient.invalidateQueries({ queryKey: ['all-services-health'] });
    },
  });
};

// Cache clear mutation
export const useClearCache = () => {
  const queryClient = useQueryClient();
  
  return useMutation<any, Error, void>({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/cache/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'all' }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to clear cache');
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Refetch all queries after cache clear
      queryClient.invalidateQueries();
    },
  });
};