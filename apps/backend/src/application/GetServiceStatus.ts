import type { ServiceRegistry } from "../domain/ServiceRegistry.js";
import type { HealthResult, StatsResult } from "../domain/BaseService.js";
import type { SnapshotCache } from "./SnapshotCache.js";

export interface GetServiceStatusDeps {
  registry: ServiceRegistry;
  snapshots?: SnapshotCache;
}

export class GetServiceStatus {
  constructor(private readonly deps: GetServiceStatusDeps) {}

  async health(
    kind: string,
    instanceId: string | undefined,
    signal: AbortSignal
  ): Promise<HealthResult> {
    const svc = this.deps.registry.getByKind(kind, instanceId);
    const cached = this.deps.snapshots?.latestHealth(svc.id);
    if (cached) return cached;
    const live = await svc.checkHealth(signal);
    this.deps.snapshots?.setHealth(svc.id, live);
    return live;
  }

  async stats(
    kind: string,
    instanceId: string | undefined,
    signal: AbortSignal
  ): Promise<StatsResult> {
    const svc = this.deps.registry.getByKind(kind, instanceId);
    if (this.deps.snapshots) return this.deps.snapshots.stats(svc, signal);
    return svc.getStats(signal);
  }
}
