import { Badge } from './ui/badge';
import { ServerStatus } from '../types/server';

interface ServerStatusBadgeProps {
  status: ServerStatus;
  className?: string;
}

export const ServerStatusBadge = ({ status, className }: ServerStatusBadgeProps) => {
  const getStatusVariant = (status: ServerStatus) => {
    switch (status) {
      case 'online': return 'default';
      case 'warning': return 'secondary';
      case 'offline': return 'destructive';
      case 'maintenance': return 'outline';
      default: return 'secondary';
    }
  };

  const getStatusText = (status: ServerStatus) => {
    switch (status) {
      case 'online': return 'Online';
      case 'warning': return 'Warning';
      case 'offline': return 'Offline';
      case 'maintenance': return 'Maintenance';
      default: return 'Unknown';
    }
  };

  return (
    <Badge 
      variant={getStatusVariant(status)} 
      className={`capitalize ${className}`}
    >
      {getStatusText(status)}
    </Badge>
  );
};