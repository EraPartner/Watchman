import { cn } from "@/lib/utils";
import { ServerStatus } from "@/types/server";

interface ServerStatusBadgeProps {
  status: ServerStatus;
  className?: string;
}

export function ServerStatusBadge({ status, className }: ServerStatusBadgeProps) {
  const getStatusConfig = (status: ServerStatus) => {
    switch (status) {
      case 'online':
        return {
          label: 'Online',
          className: 'bg-status-online/20 text-status-online border-status-online/30',
          glowClass: 'glow-online'
        };
      case 'offline':
        return {
          label: 'Offline',
          className: 'bg-status-offline/20 text-status-offline border-status-offline/30',
          glowClass: 'glow-offline'
        };
      case 'warning':
        return {
          label: 'Warning',
          className: 'bg-status-warning/20 text-status-warning border-status-warning/30',
          glowClass: ''
        };
      case 'maintenance':
        return {
          label: 'Maintenance',
          className: 'bg-status-info/20 text-status-info border-status-info/30',
          glowClass: ''
        };
    }
  };

  const config = getStatusConfig(status);

  return (
    <div
      className={cn(
        "inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border transition-smooth",
        config.className,
        status === 'online' && "animate-pulse-slow",
        className
      )}
    >
      <div
        className={cn(
          "w-2 h-2 rounded-full mr-2 transition-smooth",
          status === 'online' && "bg-status-online glow-online",
          status === 'offline' && "bg-status-offline glow-offline",
          status === 'warning' && "bg-status-warning",
          status === 'maintenance' && "bg-status-info"
        )}
      />
      {config.label}
    </div>
  );
}