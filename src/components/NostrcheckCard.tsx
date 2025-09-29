import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ExternalLink, Globe, Wifi, AlertTriangle } from 'lucide-react';
import { ServerStatus } from '../types/server';
import { useConfig } from '../hooks/use-config';
import { ServerStatusBadge } from './ServerStatusBadge';

interface NostrcheckCardProps {
  name: string;
  status: ServerStatus;
  url?: string;
}

export const NostrcheckCard: React.FC<NostrcheckCardProps> = ({ name, status, url }) => {
  const { config } = useConfig();

  // Prefer configured backend value if present
  // Default relay URL set to the requested public host unless overridden by backend config or prop
  const relayUrl = config?.services.nostrcheck?.relayUrl || url || 'https://tornostrtorrent.com';
  // Normalize display: strip http(s)/ws(s) scheme and trailing slash so addresses look clean
  const displayUrl = relayUrl.replace(/^(?:https?:|wss?:)\/\//, '').replace(/\/$/, '');
  // Ensure we have a clickable href with a scheme. If the backend provides host:port without scheme, default to http://
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(relayUrl);
  const normalizedHref = hasScheme ? relayUrl : `http://${relayUrl}`;

  const openRelay = () => {
    // open in new tab
    if (!normalizedHref) return;
    window.open(normalizedHref, '_blank');
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex flex-col">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {name}
          </CardTitle>
          <button
            onClick={openRelay}
            className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors flex items-center gap-1 mt-1 w-fit"
            title="Open relay"
          >
            <span>{displayUrl}</span>
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <ServerStatusBadge status={status} />
          {status !== 'online' && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Wifi className="h-3 w-3" />
              Relay
            </div>
            <div className="font-mono font-semibold text-sm">{displayUrl}</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs text-gray-500">This card shows a Nostr relay running on the LAN. Configure the relay URL in the backend environment configuration.</div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={openRelay}>
              Open Relay
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Use named export only (no default export)