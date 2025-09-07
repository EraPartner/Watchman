import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ServerStatusBadge } from "@/components/ServerStatusBadge";
import { Server } from "@/types/server";
import { 
  Server as ServerIcon, 
  HardDrive, 
  Wifi, 
  Download, 
  Shield, 
  Home,
  Bitcoin,
  Wallet
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ServerCardProps {
  server: Server;
  className?: string;
}

export function ServerCard({ server, className }: ServerCardProps) {
  const getServerIcon = (type: Server['type']) => {
    const iconProps = { className: "w-5 h-5" };
    
    switch (type) {
      case 'bitcoin':
        return <Bitcoin {...iconProps} />;
      case 'storage':
        return <HardDrive {...iconProps} />;
      case 'network':
        return <Wifi {...iconProps} />;
      case 'torrent':
        return <Download {...iconProps} />;
      case 'proxy':
        return <Shield {...iconProps} />;
      case 'iot':
        return <Home {...iconProps} />;
      case 'wallet':
        return <Wallet {...iconProps} />;
      default:
        return <ServerIcon {...iconProps} />;
    }
  };

  const getTypeColor = (type: Server['type']) => {
    switch (type) {
      case 'bitcoin':
        return 'text-yellow-500';
      case 'storage':
        return 'text-blue-500';
      case 'network':
        return 'text-green-500';
      case 'torrent':
        return 'text-purple-500';
      case 'proxy':
        return 'text-red-500';
      case 'iot':
        return 'text-orange-500';
      case 'wallet':
        return 'text-yellow-400';
      default:
        return 'text-gray-500';
    }
  };

  const formatLastSeen = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <Card 
      className={cn(
        "bg-gradient-card border-border shadow-card transition-smooth hover:shadow-lg hover:scale-[1.02]",
        server.status === 'online' && "hover:glow-online",
        server.status === 'offline' && "hover:glow-offline",
        className
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={cn("p-2 rounded-lg bg-secondary/50", getTypeColor(server.type))}>
              {getServerIcon(server.type)}
            </div>
            <div>
              <h3 className="font-semibold text-base">{server.name}</h3>
              <p className="text-sm text-muted-foreground">{server.ip}{server.port && `:${server.port}`}</p>
            </div>
          </div>
          <ServerStatusBadge status={server.status} />
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {server.description && (
          <p className="text-sm text-muted-foreground mb-4">{server.description}</p>
        )}
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Last seen:</span>
            <p className="font-medium">{formatLastSeen(server.lastSeen)}</p>
          </div>
          
          {server.stats?.uptime && (
            <div>
              <span className="text-muted-foreground">Uptime:</span>
              <p className="font-medium">{server.stats.uptime}</p>
            </div>
          )}
        </div>

        {server.stats && (server.stats.cpu || server.stats.memory || server.stats.disk) && (
          <div className="mt-4 space-y-2">
            {server.stats.cpu && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">CPU:</span>
                <span className="font-medium">{server.stats.cpu}%</span>
              </div>
            )}
            {server.stats.memory && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Memory:</span>
                <span className="font-medium">{server.stats.memory}%</span>
              </div>
            )}
            {server.stats.disk && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Disk:</span>
                <span className="font-medium">{server.stats.disk}%</span>
              </div>
            )}
          </div>
        )}

        {server.stats?.network && (
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">↓ In:</span>
              <p className="font-medium">{server.stats.network.incoming}</p>
            </div>
            <div>
              <span className="text-muted-foreground">↑ Out:</span>
              <p className="font-medium">{server.stats.network.outgoing}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}