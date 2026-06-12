import type { ServiceRegistry } from "../domain/ServiceRegistry.js";
import type { HealthResult } from "../domain/BaseService.js";
import type { SnapshotCache } from "./SnapshotCache.js";
import { UnavailableError } from "../core/errors.js";

export interface AggregatedEntry {
  id: string;
  kind: string;
  instanceId: string;
  result: HealthResult;
}

export class GetAggregatedHealth {
  constructor(
    private readonly registry: ServiceRegistry,
    private readonly snapshots?: SnapshotCache
  ) {}

  async run(signal: AbortSignal): Promise<readonly AggregatedEntry[]> {
    const services = this.registry.all();
    const settled = await Promise.allSettled(
      services.map(async (s) => {
        // Serve the poller-published snapshot; only probe live before the
        // first poll has completed (e.g. right after startup/registration).
        const cached = this.snapshots?.latestHealth(s.id);
        if (cached) return cached;
        const live = await s.checkHealth(signal);
        this.snapshots?.setHealth(s.id, live);
        return live;
      })
    );
    return services.map((s, i) => {
      const r = settled[i]!;
      const result: HealthResult =
        r.status === "fulfilled"
          ? r.value
          : { ok: false, error: toUnavailable(r.reason) };
      return { id: s.id, kind: s.kind, instanceId: s.instanceId, result };
    });
  }
}

function toUnavailable(reason: unknown): UnavailableError {
  const msg = reason instanceof Error ? reason.message : String(reason);
  return new UnavailableError(msg);
}
