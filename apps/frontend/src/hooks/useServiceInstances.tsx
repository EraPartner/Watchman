import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../services/ApiClient";
import { queryKeys } from "../lib/queryKeys";

export interface ServiceInstance {
  id: string;
  type: string;
}

export interface ServiceInstancesData {
  instances: Record<
    string,
    {
      count: number;
      instances: ServiceInstance[];
    }
  >;
  timestamp: string;
}

export const useServiceInstances = () => {
  const query = useQuery<ServiceInstancesData>({
    queryKey: queryKeys.servicesInstances(),
    queryFn: () => apiClient.getServiceInstances(),
    refetchInterval: 60000, // Refresh every minute
    retry: 1,
  });

  const getInstances = (serviceType: string): ServiceInstance[] => {
    return query.data?.instances[serviceType]?.instances || [];
  };

  const getInstanceCount = (serviceType: string): number => {
    return query.data?.instances[serviceType]?.count || 0;
  };

  const hasMultipleInstances = (serviceType: string): boolean => {
    return getInstanceCount(serviceType) > 1;
  };

  return {
    ...query,
    getInstances,
    getInstanceCount,
    hasMultipleInstances,
  };
};
