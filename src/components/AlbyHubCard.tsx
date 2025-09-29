import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ServerStatusBadge } from './ServerStatusBadge';
import { apiClient } from '../services/ApiClient';
import { Server, ExternalLink } from 'lucide-react';

export const AlbyHubCard: React.FC = () => {
  const [status, setStatus] = useState<'online'|'offline'|'warning'|'loading'>('loading');
  const [stats, setStats] = useState<any | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        const health = await apiClient.getAlbyStatus();
        if (!mounted) return;

        const mapped = health.status === 'not_configured' ? 'offline' : (health.status || 'offline');
        setStatus(mapped as any);

        if (health.status === 'online' || health.status === 'warning') {
          try {
            const s = await apiClient.getAlbyStats();
            if (mounted) setStats(s);
          } catch (e) {
            if (mounted) setStats(null);
          }
        } else {
          setStats(null);
        }
      } catch (err) {
        if (!mounted) return;
        setStatus('offline');
        setStats(null);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const renderLink = () => {
    // try to find a URL in stats or fallback to frontend config later
    const url = (stats && (stats.info?.raw?.web_url || stats.info?.raw?.url || stats.endpoint || stats.info?.raw?.homepage || stats.info?.raw?.website)) || null;
    if (!url) return null;
    const href = String(url).replace(/\/$/, '');
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1">
        <span className="truncate">{href}</span>
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  };

  const renderApps = () => {
    const apps = stats?.apps;
    if (!apps) return null;

    if (Array.isArray(apps)) {
      const count = apps.length;
      const list = apps.slice(0, 8);
      return (
        <div className="border-t pt-3">
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Server className="h-3 w-3" /> Installed Apps ({count})</div>
          <div className="grid grid-cols-1 gap-2">
            {list.map((a: any, idx: number) => {
              const name = a.name || a.title || a.id || JSON.stringify(a).slice(0, 30);
              const url = a.url || a.homepage || a.link || a.web_url || null;
              return (
                <div key={`alby-app-${idx}`} className="flex items-center justify-between">
                  <div className="text-sm truncate">{name}</div>
                  {url ? (
                    <a href={String(url)} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
              );
            })}
            {apps.length > 8 && <div className="text-xs text-muted-foreground">And {apps.length - 8} more...</div>}
          </div>
        </div>
      );
    }

    // If apps is an object or string, show raw
    return (
      <div className="border-t pt-3">
        <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Server className="h-3 w-3" /> Installed Apps</div>
        <pre className="text-xs font-mono truncate">{typeof apps === 'string' ? apps.slice(0, 300) : JSON.stringify(apps, null, 2).slice(0, 300)}</pre>
      </div>
    );
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          Alby Hub
        </CardTitle>
        <ServerStatusBadge status={status} />
      </CardHeader>
      {status !== 'loading' && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs"><Server className="h-3 w-3" />Status</div>
              <div className="font-mono font-semibold text-sm capitalize">{status}</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground text-xs"><Server className="h-3 w-3" />Endpoint</div>
              <div className="font-mono font-semibold text-sm truncate">{stats?.info?.raw?.endpoint || stats?.endpoint || stats?.info?.raw?.url || 'Configured via backend'}</div>
            </div>
          </div>

          {stats && (
            <div>
              <div className="border-t pt-3">
                <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Server className="h-3 w-3" /> Info</div>
                <div className="grid grid-cols-1 gap-2">
                  {stats.info?.name && <div className="text-xs text-muted-foreground">Name</div>}
                  {stats.info?.name && <div className="font-mono font-semibold text-sm">{stats.info.name}</div>}
                  {stats.info?.version && <div className="text-xs text-muted-foreground">Version</div>}
                  {stats.info?.version && <div className="font-mono font-semibold text-sm">{stats.info.version}</div>}
                  {renderLink()}
                </div>
              </div>

              {renderApps()}
            </div>
          )}

        </CardContent>
      )}
    </Card>
  );
};

export default AlbyHubCard;