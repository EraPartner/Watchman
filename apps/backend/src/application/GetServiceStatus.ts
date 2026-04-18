import type { ServiceRegistry } from '../domain/ServiceRegistry.js';
import type { HealthResult, StatsResult } from '../domain/BaseService.js';

export interface GetServiceStatusDeps {
  registry: ServiceRegistry;
}

export class GetServiceStatus {
  constructor(private readonly deps: GetServiceStatusDeps) {}

  async health(kind: string, instanceId: string | undefined, signal: AbortSignal): Promise<HealthResult> {
    const svc = this.deps.registry.getByKind(kind, instanceId);
    return svc.checkHealth(signal);
  }

  async stats(kind: string, instanceId: string | undefined, signal: AbortSignal): Promise<StatsResult> {
    const svc = this.deps.registry.getByKind(kind, instanceId);
    return svc.getStats(signal);
  }
}
