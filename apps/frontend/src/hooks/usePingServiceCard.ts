import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../services/ApiClient";
import { useEnabledServices } from "./useEnabledServices";
import { APP_CONFIG } from "../lib/constants";
import { buildHref } from "../lib/url";
import { queryKeys } from "../lib/queryKeys";

interface PingServiceData {
  status?: string;
  data?: {
    host?: string;
    ping?: boolean | null;
    ports?: Array<{ port: number; open: boolean }>;
  };
  error?: string;
}

interface UsePingServiceCardOptions {
  serviceKey: string;
  instanceId: string;
  refetchInterval?: number;
}

export function usePingServiceCard({
  serviceKey,
  instanceId,
  refetchInterval = APP_CONFIG.ROON_REFRESH_INTERVAL,
}: UsePingServiceCardOptions) {
  const { isServiceEnabled } = useEnabledServices();
  const isEnabled = isServiceEnabled(serviceKey);

  const statusQuery = useQuery({
    queryKey: queryKeys.serviceStatus(serviceKey, instanceId),
    queryFn: () => apiClient.getServiceHealth(instanceId),
    refetchInterval,
    retry: 1,
    enabled: isEnabled,
  });

  const statsQuery = useQuery({
    queryKey: queryKeys.serviceStats(serviceKey, instanceId),
    queryFn: () => apiClient.getServiceStats(instanceId),
    refetchInterval,
    retry: 1,
    enabled: isEnabled,
  });

  const loading = statusQuery.isLoading && statsQuery.isLoading;
  const status = statusQuery.data as PingServiceData | undefined;
  const stats = statsQuery.data as PingServiceData | undefined;

  const isOnline = status?.status === "online" || stats?.status === "online";
  const hasError = status?.status === "error" || stats?.status === "error";

  const hostValue = status?.data?.host ?? stats?.data?.host ?? null;
  const hostHref = buildHref(hostValue);

  const ping = stats?.data?.ping ?? status?.data?.ping;
  const ports = stats?.data?.ports ?? status?.data?.ports;
  const errorMessage = status?.error ?? stats?.error;

  return {
    loading,
    status,
    stats,
    isOnline,
    hasError,
    hostValue,
    hostHref,
    ping,
    ports,
    errorMessage,
  };
}
