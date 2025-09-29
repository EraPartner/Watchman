import React from 'react';
import { ExternalLink } from 'lucide-react';
import { formatDisplayUrl, buildHref, openHref } from '../lib/url';

interface ServiceLinkProps {
  raw?: string | null;
  preferHttps?: boolean;
  title?: string;
  className?: string;
  compact?: boolean;
  hostOnly?: boolean;
}

export const ServiceLink: React.FC<ServiceLinkProps> = ({ raw, preferHttps = true, title, className = '', compact = false, hostOnly = false }) => {
  if (!raw) return <div className="text-xs text-muted-foreground">N/A</div>;

  // For hostOnly, strip protocol and any path, leaving host[:port]
  const display = hostOnly
    ? String(raw).replace(/^(?:https?:|wss?:)\/\//, '').replace(/\/.*$/, '')
    : formatDisplayUrl(raw);
  const href = buildHref(raw, preferHttps);

  return (
    <button
      onClick={() => openHref(href)}
      title={title}
      className={`text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors flex items-center gap-1 mt-1 w-fit ${className}`}
    >
      <span className={compact ? 'truncate' : ''}>{display}</span>
      <ExternalLink className="h-3 w-3" />
    </button>
  );
};

export default ServiceLink;