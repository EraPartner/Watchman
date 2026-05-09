import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../services/ApiClient";
import { queryKeys } from "../lib/queryKeys";
import type { InstanceInfo } from "../services/ApiClient";

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

function groupByKind(list: InstanceInfo[] | unknown): ServiceInstancesData {
  const instances: ServiceInstancesData["instances"] = {};
  if (!Array.isArray(list)) {
    return { instances, timestamp: new Date().toISOString() };
  }
  for (const info of list) {
    const bucket = instances[info.kind] ?? { count: 0, instances: [] };
    bucket.instances = [
      ...bucket.instances,
      { id: info.instanceId, type: info.kind },
    ];
    bucket.count = bucket.instances.length;
    instances[info.kind] = bucket;
  }
  return { instances, timestamp: new Date().toISOString() };
}

export const useServiceInstances = () => {
  const query = useQuery<ServiceInstancesData>({
    queryKey: queryKeys.servicesInstances(),
    queryFn: async () => groupByKind(await apiClient.getInstances()),
    refetchInterval: 60000,
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
