import { LiveServerDashboard } from '../components/LiveServerDashboard';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight">Watchman Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Monitor your services: AdGuard Home, Synology NAS, Tor node, Bitcoin Core, qBittorrent and more.
          </p>
        </div>
        
        <LiveServerDashboard />
      </div>
    </div>
  );
};

export default Index;