import { useState, useEffect } from "react";
import { ServerCard } from "@/components/ServerCard";
import { Server, ServerStatus } from "@/types/server";
import { mockServers } from "@/data/mockServers";
import { Button } from "@/components/ui/button";
import { RefreshCw, Filter, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export function ServerDashboard() {
  const [servers, setServers] = useState<Server[]>(mockServers);
  const [filter, setFilter] = useState<ServerStatus | 'all'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshServers = async () => {
    setIsRefreshing(true);
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // In a real implementation, you would fetch server status here
    // For now, we'll just update the lastSeen timestamps
    setServers(prev => prev.map(server => ({
      ...server,
      lastSeen: new Date()
    })));
    
    setIsRefreshing(false);
  };

  const filteredServers = servers.filter(server => 
    filter === 'all' || server.status === filter
  );

  const statusCounts = {
    all: servers.length,
    online: servers.filter(s => s.status === 'online').length,
    offline: servers.filter(s => s.status === 'offline').length,
    warning: servers.filter(s => s.status === 'warning').length,
    maintenance: servers.filter(s => s.status === 'maintenance').length,
  };

  const filterButtons: { key: ServerStatus | 'all', label: string, color?: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'online', label: 'Online', color: 'text-status-online' },
    { key: 'offline', label: 'Offline', color: 'text-status-offline' },
    { key: 'warning', label: 'Warning', color: 'text-status-warning' },
    { key: 'maintenance', label: 'Maintenance', color: 'text-status-info' }
  ];

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                Server Dashboard
              </h1>
              <p className="text-muted-foreground mt-2">
                Monitor your homelab infrastructure in real-time
              </p>
            </div>
            
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshServers}
                disabled={isRefreshing}
                className="transition-smooth"
              >
                <RefreshCw className={cn(
                  "w-4 h-4 mr-2",
                  isRefreshing && "animate-spin"
                )} />
                Refresh
              </Button>
              
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>

          {/* Status Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {filterButtons.map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  "p-4 rounded-lg bg-card border border-border transition-smooth hover:shadow-card text-left",
                  filter === key && "ring-2 ring-primary glow-accent"
                )}
              >
                <div className="text-2xl font-bold mb-1">
                  {statusCounts[key]}
                </div>
                <div className={cn("text-sm font-medium", color || "text-muted-foreground")}>
                  {label}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Server Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredServers.map((server) => (
            <ServerCard 
              key={server.id} 
              server={server}
              className="transition-smooth hover:scale-[1.02]"
            />
          ))}
        </div>

        {filteredServers.length === 0 && (
          <div className="text-center py-12">
            <div className="text-muted-foreground text-lg mb-2">
              No servers found
            </div>
            <p className="text-sm text-muted-foreground">
              {filter !== 'all' 
                ? `No servers with status "${filter}"`
                : "No servers configured"
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
}