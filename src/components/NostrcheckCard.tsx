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

  // Read backend config values
  const nostrCfg = config?.services?.nostrcheck as { webUrl?: string | null; relayUrl?: string | null } | undefined;

  // Relay (raw) — the URL user asked to show under the name
  const relayRaw = nostrCfg?.relayUrl || url || 'localhost:3000';
  // Web UI — the clickable web UI URL to show under the "Relay" section (NOSTRCHECK_WEB_URL)
  const webRaw = nostrCfg?.webUrl || null;

  const formatDisplay = (raw?: string | null) => {
    if (!raw) return 'N/A';
    return String(raw).replace(/^(?:https?:|wss?:)\/\//, '').replace(/\/$/, '');
  };

  // Build hrefs: allow choosing a preference for https when a scheme is missing (used for web UI)
  const makeHref = (raw?: string | null, preferHttps = false) => {
    if (!raw) return null;
    const r = String(raw);
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(r);
    if (hasScheme) return r;
    return preferHttps ? `https://${r}` : `http://${r}`;
  };

  const relayDisplay = formatDisplay(relayRaw);
  const relayHref = makeHref(relayRaw, false);
  const webDisplay = formatDisplay(webRaw);
  // Prefer https for the web UI when a scheme is not provided
  const webHref = makeHref(webRaw, true);

  const openRelay = () => {
    // open chosen href (prefer relayHref here for header link)
    if (!relayHref) return;
    window.open(relayHref, '_blank');
  };

  const openWeb = () => {
    if (!webHref) return;
    window.open(webHref, '_blank');
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex flex-col">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {name}
          </CardTitle>
          {/* Clickable relay URL under the name (NOSTRCHECK_RELAY_URL) */}
          <button
            onClick={openRelay}
            className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors flex items-center gap-1 mt-1 w-fit"
            title="Open relay"
          >
            <span>{relayDisplay}</span>
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
            {/* Under the Relay section show the clickable Web UI URL (NOSTRCHECK_WEB_URL) when available */}
            {webHref ? (
              <button onClick={openWeb} className="font-mono font-semibold text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1">
                <span>{webDisplay}</span>
                <ExternalLink className="h-3 w-3" />
              </button>
            ) : (
              <div className="font-mono font-semibold text-sm">{relayDisplay}</div>
            )}
          </div>
        </div>

        <div className="space-y-2">

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={openRelay}>
              Open Relay
            </Button>
            {webHref && (
              <Button variant="outline" size="sm" onClick={openWeb}>
                Open Web UI
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Use named export only (no default export)