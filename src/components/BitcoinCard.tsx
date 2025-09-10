import React, { useEffect, useState } from 'react';
import { Card } from './ui/card';
import { ServiceHealth, BitcoinStats, ApiError } from '../types/api';

export const BitcoinCard: React.FC = () => {
  const [status, setStatus] = useState<'online' | 'offline' | 'warning' | 'loading'>('loading');
  const [stats, setStats] = useState<BitcoinStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      try {
        const healthRes = await fetch('/api/bitcoin/health');
        const health: ServiceHealth = await healthRes.json();
        setStatus(health.status);
        
        if (health.status === 'online' || health.status === 'warning') {
          const statsRes = await fetch('/api/bitcoin/stats');
          const nodeStats: BitcoinStats | ApiError = await statsRes.json();
          
          if ('error' in nodeStats) {
            setError(nodeStats.error);
            setStats(null);
          } else {
            setStats(nodeStats);
            setError(null);
          }
        } else {
          setStats(null);
        }
        setError(health.error || null);
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        setError(errorMessage);
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
    <Card className="w-full max-w-md mx-auto p-4 bg-gray-900 text-gray-100 border border-yellow-600">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold">Bitcoin Node</h2>
        <span className={`rounded px-2 py-1 text-xs font-semibold ${
          status === 'online' ? 'bg-green-700' : status === 'warning' ? 'bg-yellow-600' : status === 'loading' ? 'bg-gray-500' : 'bg-red-700'
        }`}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      </div>
      {error && (
        <div className="text-red-400 text-xs mb-2">{error}</div>
      )}
      {stats ? (
        <div className="space-y-1">
          <div>Chain: <span className="font-mono">{stats.chain}</span></div>
          <div>Block: <span className="font-mono">{stats.blocks}</span> / {stats.headers}</div>
          <div>Peers: <span className="font-mono">{stats.connections}</span></div>
          <div>Difficulty: <span className="font-mono">{stats.difficulty}</span></div>
          <div>Sync: <span className="font-mono">{(stats.verificationProgress * 100).toFixed(2)}%</span></div>
          <div>Version: <span className="font-mono">{stats.version}</span></div>
          {stats.initialBlockDownload && (
            <div className="text-yellow-400 text-xs">Initial block download in progress</div>
          )}
        </div>
      ) : status === 'loading' ? (
        <div className="text-gray-400">Loading...</div>
      ) : null}
    </Card>
  );
};