import { useQuery } from "@tanstack/react-query";
import { APP_CONFIG } from "../../lib/constants";
import { apiClient } from "../../services/ApiClient";
import { queryKeys } from "../../lib/queryKeys";

interface UseDashboardQueriesOptions {
  adguardEnabled: boolean;
  isServiceEnabled: (serviceName: string) => boolean;
  frontendConfigEnabled?: boolean;
}

export function useDashboardQueries({
  adguardEnabled,
  isServiceEnabled,
  frontendConfigEnabled = true,
}: UseDashboardQueriesOptions) {
  const adguardQuery = useQuery({
    queryKey: queryKeys.adguardFull(),
    queryFn: async () => {
      const [health, stats] = await Promise.all([
        apiClient.getAdGuardStatus(),
        apiClient.getAdGuardStats(),
      ]);
      return { health, stats };
    },
    refetchInterval: APP_CONFIG.ADGUARD_REFRESH_INTERVAL,
    retry: 1,
    enabled: adguardEnabled,
  });

  const torQuery = useQuery({
    queryKey: queryKeys.torRelay(),
    queryFn: () => apiClient.getTorRelay(),
    refetchInterval: APP_CONFIG.TOR_REFRESH_INTERVAL,
    retry: 1,
    enabled: isServiceEnabled("tor"),
  });

  const frontendConfigQuery = useQuery({
    queryKey: queryKeys.frontendConfig(),
    queryFn: () => apiClient.getFrontendConfig(),
    staleTime: Infinity,
    retry: 2,
    enabled: frontendConfigEnabled,
  });

  const bitcoinQuery = useQuery({
    queryKey: queryKeys.serviceStatus("bitcoin"),
    queryFn: () => apiClient.getBitcoinStatus(),
    refetchInterval: 30000,
    retry: 1,
    enabled: isServiceEnabled("bitcoin"),
  });

  const qbittorrentQuery = useQuery({
    queryKey: queryKeys.serviceStatus("qbittorrent"),
    queryFn: () => apiClient.getQBittorrentStatus(),
    refetchInterval: 30000,
    retry: 1,
    enabled: isServiceEnabled("qbittorrent"),
  });

  const ipfsQuery = useQuery({
    queryKey: queryKeys.serviceStatus("ipfs"),
    queryFn: () => apiClient.getIpfsStatus(),
    refetchInterval: 30000,
    retry: 1,
    enabled: isServiceEnabled("ipfs"),
  });

  const synologyQuery = useQuery({
    queryKey: queryKeys.serviceStatus("synology"),
    queryFn: () => apiClient.getSynologyStatus(),
    refetchInterval: 60000,
    retry: 1,
    enabled: isServiceEnabled("synology"),
  });

  const roonQuery = useQuery({
    queryKey: queryKeys.serviceStatus("roon"),
    queryFn: () => apiClient.getRoonStatus(),
    refetchInterval: APP_CONFIG.ADGUARD_REFRESH_INTERVAL,
    retry: 1,
    enabled: isServiceEnabled("roon"),
  });

  const servicesHealthQuery = useQuery({
    queryKey: queryKeys.servicesHealth(),
    queryFn: () => apiClient.getServicesHealth(),
    refetchInterval: 30000,
    retry: 1,
    enabled: true,
  });

  const refreshEnabledQueries = async () => {
    const refreshPromises: Array<Promise<unknown>> = [];

    if (adguardEnabled) refreshPromises.push(adguardQuery.refetch());
    if (isServiceEnabled("tor")) refreshPromises.push(torQuery.refetch());
    if (frontendConfigEnabled) {
      refreshPromises.push(frontendConfigQuery.refetch());
    }
    if (isServiceEnabled("bitcoin"))
      refreshPromises.push(bitcoinQuery.refetch());
    if (isServiceEnabled("qbittorrent")) {
      refreshPromises.push(qbittorrentQuery.refetch());
    }
    if (isServiceEnabled("ipfs")) refreshPromises.push(ipfsQuery.refetch());
    if (isServiceEnabled("synology"))
      refreshPromises.push(synologyQuery.refetch());
    if (isServiceEnabled("roon")) refreshPromises.push(roonQuery.refetch());
    refreshPromises.push(servicesHealthQuery.refetch());

    await Promise.all(refreshPromises);
  };

  return {
    adguardQuery,
    torQuery,
    frontendConfigQuery,
    bitcoinQuery,
    qbittorrentQuery,
    ipfsQuery,
    synologyQuery,
    roonQuery,
    servicesHealthQuery,
    refreshEnabledQueries,
  };
}
