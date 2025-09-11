import { memo, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useServiceHealth, useServiceStats } from '@/hooks/useServiceHealth';
import { Activity, RefreshCw, ExternalLink, Zap, AlertTriangle } from 'lucide-react';

interface PerformantServiceCardProps {
  serviceName: string;
  displayName: string;
  enableStats?: boolean;
  webUrl?: string;
  priority?: 'high' | 'medium' | 'low';
}

export const PerformantServiceCard = memo<PerformantServiceCardProps>(({ 
  serviceName, 
  displayName, 
  enableStats = true,
  webUrl,
  priority = 'medium'
}) => {
  const { 
    data: health, 
    isLoading: healthLoading, 
    error: healthError,
    refetch: refetchHealth 
  } = useServiceHealth(serviceName, {
    refetchInterval: priority === 'high' ? 5000 : priority === 'medium' ? 10000 : 15000,
    enabled: true,
    staleTime: priority === 'high' ? 2000 : 5000,
  });
  
  const { 
    data: stats, 
    isLoading: statsLoading 
  } = useServiceStats(serviceName, enableStats);

  // Memoize expensive calculations
  const statusMetrics = useMemo(() => {
    if (!health) return null;
    
    const getStatusColor = (status: string) => {
      switch (status) {
        case 'online': return 'bg-green-500 text-green-50';
        case 'offline': return 'bg-red-500 text-red-50';
        case 'warning': return 'bg-yellow-500 text-yellow-50';
        default: return 'bg-gray-500 text-gray-50';
      }
    };

    const getPerformanceLevel = (responseTime?: number) => {
      if (!responseTime) return 'unknown';
      if (responseTime < 100) return 'excellent';
      if (responseTime < 300) return 'good';
      if (responseTime < 1000) return 'fair';
      return 'poor';
    };

    return {
      statusColor: getStatusColor(health.status),
      performanceLevel: getPerformanceLevel(health.responseTime),
      isHealthy: health.status === 'online' && (health.responseTime || 0) < 1000,
      displayResponseTime: health.responseTime ? `${health.responseTime}ms` : 'N/A'
    };
  }, [health]);

  const formattedStats = useMemo(() => {
    if (!stats || !enableStats) return null;
    
    return Object.entries(stats)
      .slice(0, 6)
      .filter(([key, value]) => value !== null && value !== undefined)
      .map(([key, value]) => ({
        key: key.replace(/([A-Z])/g, ' $1').toLowerCase(),
        value: typeof value === 'number' ? value.toLocaleString() : String(value),
        isImportant: ['uptime', 'connections', 'queries', 'blocks'].some(important => 
          key.toLowerCase().includes(important)
        )
      }));
  }, [stats, enableStats]);

  const isLoading = healthLoading || (enableStats && statsLoading);
  const hasError = healthError;

  return (
    <Card className={`h-full transition-all duration-300 hover:shadow-lg border-l-4 ${
      statusMetrics?.isHealthy 
        ? 'border-l-green-500 hover:border-l-green-600' 
        : 'border-l-red-500 hover:border-l-red-600'
    }`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {priority === 'high' && <Zap className="h-4 w-4 text-yellow-500" />}
            <CardTitle className="text-lg font-semibold">{displayName}</CardTitle>
          </div>
          {statusMetrics && (
            <Badge 
              className={`${statusMetrics.statusColor} px-2 py-1 text-xs font-medium`}
              variant="secondary"
            >
              {health?.status}
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {statusMetrics?.performanceLevel && (
            <Badge 
              variant="outline" 
              className={`text-xs ${
                statusMetrics.performanceLevel === 'excellent' ? 'border-green-500 text-green-700' :
                statusMetrics.performanceLevel === 'good' ? 'border-blue-500 text-blue-700' :
                statusMetrics.performanceLevel === 'fair' ? 'border-yellow-500 text-yellow-700' :
                'border-red-500 text-red-700'
              }`}
            >
              {statusMetrics.displayResponseTime}
            </Badge>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetchHealth()}
            disabled={isLoading}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          
          {webUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(webUrl, '_blank')}
              className="h-8 w-8 p-0"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
              <span className="text-sm text-muted-foreground">Loading...</span>
            </div>
          </div>
        ) : hasError ? (
          <div className="flex items-center gap-2 py-4 text-red-600 bg-red-50 rounded-lg px-3">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">
              Failed to load: {healthError?.message || 'Unknown error'}
            </span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Quick Status Overview */}
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              <Activity className="h-4 w-4" />
              <span className="text-sm font-medium">Status:</span>
              <span className="text-sm">{health?.status || 'Unknown'}</span>
              {health?.lastCheck && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(health.lastCheck).toLocaleTimeString()}
                </span>
              )}
            </div>
            
            {/* Stats Grid */}
            {formattedStats && formattedStats.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {formattedStats.map(({ key, value, isImportant }) => (
                  <div 
                    key={key} 
                    className={`p-2 rounded border text-center ${
                      isImportant ? 'bg-primary/5 border-primary/20' : 'bg-muted/30'
                    }`}
                  >
                    <div className="text-xs text-muted-foreground truncate" title={key}>
                      {key}
                    </div>
                    <div className={`text-sm font-mono ${isImportant ? 'font-semibold' : ''}`}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

PerformantServiceCard.displayName = 'PerformantServiceCard';