import { LiveServerDashboard } from '../components/LiveServerDashboard';
import { useWebSocket } from '../hooks/useWebSocket';
import { useEffect } from 'react';

const Index = () => {
  const { isConnected, reconnectAttempts } = useWebSocket();

  useEffect(() => {
    // Register service worker for offline capability
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('✅ Service Worker registered:', registration);
        })
        .catch(error => {
          console.error('❌ Service Worker registration failed:', error);
        });
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Connection Status Banner */}
      {!isConnected && (
        <div className="bg-yellow-500 text-yellow-900 px-4 py-2 text-center text-sm">
          {reconnectAttempts > 0 
            ? `Reconnecting to live updates... (attempt ${reconnectAttempts}/5)` 
            : 'Connecting to live updates...'
          }
        </div>
      )}
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight">Watchman Dashboard</h1>
              <p className="text-muted-foreground mt-2">
                Monitor your services: AdGuard Home, Synology NAS, Tor node, Bitcoin Core, qBittorrent and more.
              </p>
            </div>
            
            {/* Live Status Indicator */}
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-muted-foreground">
                {isConnected ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
        
        <LiveServerDashboard />
      </div>
    </div>
  );
};

export default Index;