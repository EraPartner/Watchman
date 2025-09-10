import { useState, useEffect, useCallback } from 'react';
import { ServiceHealth } from '../types/api';

interface UseServiceHealthOptions {
  endpoint: string;
  interval?: number;
  enabled?: boolean;
}

export const useServiceHealth = ({ 
  endpoint, 
  interval = 15000, 
  enabled = true 
}: UseServiceHealthOptions) => {
  const [health, setHealth] = useState<ServiceHealth | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    if (!enabled) return;
    
    try {
      setError(null);
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data: ServiceHealth = await response.json();
      setHealth(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setHealth(null);
    } finally {
      setIsLoading(false);
    }
  }, [endpoint, enabled]);

  useEffect(() => {
    if (!enabled) return;

    fetchHealth();
    const intervalId = setInterval(fetchHealth, interval);

    return () => clearInterval(intervalId);
  }, [fetchHealth, interval, enabled]);

  const refetch = useCallback(() => {
    setIsLoading(true);
    fetchHealth();
  }, [fetchHealth]);

  return {
    health,
    isLoading,
    error,
    refetch,
  };
};