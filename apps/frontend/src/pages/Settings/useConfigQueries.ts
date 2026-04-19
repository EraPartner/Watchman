import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  configApi,
  type ServiceInstance,
  type ServiceInstanceInput,
  type KindSchema,
  type AuditEntry,
  type SetupStatus,
  type TestConnectionResult,
  type ExportBundle,
  type ImportResult,
} from "../../services/configApi";

const KEYS = {
  setup: ["config", "setup"] as const,
  kinds: ["config", "kinds"] as const,
  services: ["config", "services"] as const,
  service: (id: string) => ["config", "services", id] as const,
  audit: (limit: number) => ["config", "audit", limit] as const,
};

export function useSetupStatus() {
  return useQuery<SetupStatus>({
    queryKey: KEYS.setup,
    queryFn: () => configApi.getSetupStatus(),
    staleTime: 0,
  });
}

export function useKinds() {
  return useQuery<KindSchema[]>({
    queryKey: KEYS.kinds,
    queryFn: () => configApi.getKinds(),
    staleTime: 60_000,
  });
}

export function useServices() {
  return useQuery<ServiceInstance[]>({
    queryKey: KEYS.services,
    queryFn: () => configApi.listServices(),
  });
}

export function useService(id: string | null) {
  return useQuery<ServiceInstance>({
    queryKey: id ? KEYS.service(id) : ["config", "services", "_none"],
    queryFn: () => configApi.getService(id as string),
    enabled: !!id,
  });
}

export function useAudit(limit = 100) {
  return useQuery<AuditEntry[]>({
    queryKey: KEYS.audit(limit),
    queryFn: () => configApi.listAudit(limit),
  });
}

export function useCreateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ServiceInstanceInput) => configApi.createService(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.services });
      qc.invalidateQueries({ queryKey: ["config", "audit"] });
    },
  });
}

export function useUpdateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<ServiceInstanceInput>;
    }) => configApi.updateService(id, input),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: KEYS.services });
      qc.invalidateQueries({ queryKey: KEYS.service(id) });
      qc.invalidateQueries({ queryKey: ["config", "audit"] });
    },
  });
}

export function useDeleteService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => configApi.deleteService(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.services });
      qc.invalidateQueries({ queryKey: ["config", "audit"] });
    },
  });
}

export function useTestService() {
  return useMutation<TestConnectionResult, Error, string>({
    mutationFn: (id: string) => configApi.testService(id),
  });
}

export function useExportConfig() {
  return useMutation<ExportBundle, Error, void>({
    mutationFn: () => configApi.exportConfig(),
  });
}

export function useImportConfig() {
  const qc = useQueryClient();
  return useMutation<ImportResult, Error, ExportBundle>({
    mutationFn: (bundle) => configApi.importConfig(bundle),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.services });
      qc.invalidateQueries({ queryKey: ["config", "audit"] });
    },
  });
}
