import React from 'react';
import { Badge } from './ui/badge';
import { RefreshCw, CheckCircle, AlertCircle, Wifi } from 'lucide-react';

interface ServerStatusBadgeProps {
  // Include maintenance for ServerStatus compatibility, plus loading/error used elsewhere
  status: 'online' | 'offline' | 'warning' | 'loading' | 'error' | 'maintenance';
}

export const ServerStatusBadge: React.FC<ServerStatusBadgeProps> = ({ status }) => {
  const isLoading = status === 'loading';
  const isOnline = status === 'online';
  const isError = status === 'error' || status === 'warning';

  if (isLoading) {
    return (
      <Badge variant="secondary" className="flex items-center gap-1 px-2 py-1 text-xs">
        <RefreshCw className="h-3 w-3 animate-spin" />
        Loading
      </Badge>
    );
  }

  if (isOnline) {
    return (
      <Badge variant="default" className="flex items-center gap-1 px-2 py-1 text-xs bg-green-500">
        <CheckCircle className="h-3 w-3" />
        Online
      </Badge>
    );
  }

  if (isError) {
    return (
      <Badge variant="destructive" className="flex items-center gap-1 px-2 py-1 text-xs">
        <AlertCircle className="h-3 w-3" />
        {status === 'warning' ? 'Warning' : 'Error'}
      </Badge>
    );
  }

  if (status === 'maintenance') {
    return (
      <Badge variant="outline" className="flex items-center gap-1 px-2 py-1 text-xs">
        <Wifi className="h-3 w-3" />
        Maintenance
      </Badge>
    );
  }

  // default to offline
  return (
    <Badge variant="secondary" className="flex items-center gap-1 px-2 py-1 text-xs">
      <Wifi className="h-3 w-3" />
      Offline
    </Badge>
  );
};

export default ServerStatusBadge;