import React from 'react';
import { Badge } from './ui/badge';

interface ServerStatusBadgeProps {
  status: 'online' | 'offline' | 'warning' | 'loading';
}

export const ServerStatusBadge: React.FC<ServerStatusBadgeProps> = ({ status }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'online':
        return 'bg-green-500 text-white';
      case 'offline':
        return 'bg-red-500 text-white';
      case 'warning':
        return 'bg-yellow-500 text-black';
      case 'loading':
        return 'bg-gray-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  return (
    <Badge className={`${getStatusColor()} px-2 py-1 text-xs`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
};