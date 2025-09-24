import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Server, Wifi, AlertCircle, CheckCircle, RefreshCw, Network } from 'lucide-react';

interface RoonPortCheck {
  port: number;
  open: boolean;
}

interface RoonStatus {
  status: 'online' | 'offline' | 'error';
  timestamp: string;
  data?: {
    host?: string;
    ping?: boolean | null;
    ports?: RoonPortCheck[];
  };
  error?: string;
}

const RoonCard: React.FC = () => {
  const [status, setStatus] = useState<RoonStatus | null>(null);
  const [stats, setStats] = useState<RoonStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statusRes, statsRes] = await Promise.all([
        fetch('/api/roon/status').catch(() => null),
        fetch('/api/roon/stats').catch(() => null)
      ]);

      if (statusRes?.ok) {
        const text = await statusRes.text();
        if (text.trim()) {
          try {
            setStatus(JSON.parse(text));
          } catch (err) {
            console.error('Failed to parse roon status JSON', err);
          }
        }
      } else if (statusRes) {
        console.error('Roon status response not OK', statusRes.status, statusRes.statusText);
      }

      if (statsRes?.ok) {
        const text = await statsRes.text();
        if (text.trim()) {
          try {
            setStats(JSON.parse(text));
          } catch (err) {
            console.error('Failed to parse roon stats JSON', err);
          }
        }
      } else if (statsRes) {
        console.error('Roon stats response not OK', statsRes.status, statsRes.statusText);
      }

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch Roon data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const isOnline = status?.status === 'online' || stats?.status === 'online';
  const hasError = status?.status === 'error' || stats?.status === 'error';

  const getStatusBadge = () => {
    if (loading) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Loading
        </Badge>
      );
    }

    if (isOnline) {
      return (
        <Badge variant="default" className="flex items-center gap-1 bg-green-500">
          <CheckCircle className="h-3 w-3" />
          Online
        </Badge>
      );
    }

    if (hasError) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Error
        </Badge>
      );
    }

    return (
      <Badge variant="secondary" className="flex items-center gap-1">
        <Wifi className="h-3 w-3" />
        Offline
      </Badge>
    );
  };

  const formatPingDisplay = (ping: boolean | null | undefined) => {
    // If ping succeeded
    if (ping === true) return 'ICMP: Responding';

    // If ping explicitly failed
    if (ping === false) return 'ICMP: No response';

    // If ping boolean is not provided but we have ping output, we likely attempted
    // an ICMP check but it didn't produce a success — surface as No response
    const pingOut = getPingOutput();
    if (pingOut && pingOut.trim && pingOut.trim().length > 0) return 'ICMP: No response';

    // Otherwise, ping was not attempted / not available
    return 'ICMP: N/A';
  };

  const getPingOutput = () => {
    return stats?.data?.pingOutput || status?.data?.pingOutput || null;
  };

  if (loading && !status && !stats) {
    return (
      <Card className="w-full self-start h-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Server className="h-4 w-4" />
            Roon (ROCK)
          </CardTitle>
          {getStatusBadge()}
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full self-start h-auto">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Server className="h-4 w-4" />
          Roon (ROCK)
        </CardTitle>
        {getStatusBadge()}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 text-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Server className="h-3 w-3" />
              Host
            </div>
            <div className="font-medium">{status?.data?.host || stats?.data?.host || 'Unknown'}</div>
          </div>
        </div>

        {/* Always show ping and ports (when available) so we can see TCP results even if ICMP is blocked) */}
        {(stats?.data || status?.data) && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Network className="h-3 w-3" />
                Ping
              </div>
              <div className="text-right">
                <div className="font-medium">{formatPingDisplay(stats?.data?.ping ?? status?.data?.ping)}</div>
                {getPingOutput() && (
                  <div className="text-xs text-muted-foreground break-words mt-1">{getPingOutput()}</div>
                )}
              </div>
            </div>

            {/* Ports: render regardless of overall online status to aid debugging */}
            { (stats?.data?.ports || status?.data?.ports) && (
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-muted-foreground text-sm">
                  <Network className="h-3 w-3" />
                  Ports
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(stats?.data?.ports || status?.data?.ports).map((p) => (
                    <div key={p.port} className={`rounded-md p-2 ${p.open ? 'bg-green-50' : 'bg-muted'}`}>
                      <div className="text-xs text-muted-foreground">Port</div>
                      <div className="text-sm font-medium">{p.port} — {p.open ? 'open' : 'closed'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!isOnline && !loading && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
            <div className="text-sm text-muted-foreground mb-2">{hasError ? 'Connection Error' : 'Roon Core (ROCK) is offline'}</div>
            {(status?.error || stats?.error) && (
              <div className="text-xs text-red-500 max-w-full break-words">{status?.error || stats?.error}</div>
            )}
            <button onClick={fetchData} className="mt-3 text-xs text-blue-500 hover:text-blue-700 underline" disabled={loading}>
              Retry Connection
            </button>
          </div>
        )}

        <div className="text-xs text-muted-foreground text-center pt-3 border-t">
          Last updated: {lastUpdate.toLocaleTimeString()}
        </div>
      </CardContent>
    </Card>
  );
};

export default RoonCard;
