import { useState, useEffect } from 'react';
import { apiClient } from '../services/ApiClient';

interface FrontendConfig {
  services: {
    adguard: {
      webUrl: string;
    };
    tor: {
      nickname?: string;
    };
  };
  app: {
    name: string;
    version: string;
  };
}

export const useConfig = () => {
  const [config, setConfig] = useState<FrontendConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const frontendConfig = await apiClient.getFrontendConfig();
        setConfig(frontendConfig);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch configuration');
        // Fallback configuration if backend is unavailable
        setConfig({
          services: {
            adguard: {
              webUrl: 'http://127.0.0.1:5213'
            },
            tor: {
              nickname: 'unknown'
            }
          },
          app: {
            name: 'Watchman Dashboard',
            version: '1.0.0'
          }
        });
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  return { config, loading, error };
};