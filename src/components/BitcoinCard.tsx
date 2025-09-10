import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ServerStatusBadge } from './ServerStatusBadge';
import { ServiceHealth, BitcoinStats, ApiError } from '../types/api';

interface BitcoinCardProps {}

export const BitcoinCard: React.FC<BitcoinCardProps> = () => {
  const [status, setStatus] = useState<'online' | 'offline' | 'warning' | 'loading'>('loading');
  const [stats, setStats] = useState<BitcoinStats | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      try {
        const healthRes = await fetch('/api/bitcoin/health');
        const health: ServiceHealth = await healthRes.json();
        
        if (!mounted) return;
        
        setStatus(health.status);
        
        if (health.status === 'online' || health.status === 'warning') {
          const statsRes = await fetch('/api/bitcoin/stats');
          const nodeStats: BitcoinStats | ApiError = await statsRes.json();
          
          if (!mounted) return;
          
          if ('error' in nodeStats) {
            setStats(null);
          } else {
            setStats(nodeStats);
          }
        } else {
          setStats(null);
        }
      } catch (e: unknown) {
        if (!mounted) return;
        setStatus('offline');
        setStats(null);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 15000);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Bitcoin</CardTitle>
        <ServerStatusBadge status={status} />
      </CardHeader>
      {stats && (
        <CardContent>
          <div className="text-sm text-gray-600">
            Version: <span className="font-mono">{stats.version}</span>
          </div>
        </CardContent>
      )}
    </Card>
  );
};