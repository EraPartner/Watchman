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
  private readonly registry: ServiceRegistry;
  private readonly snapshots: SnapshotCache | undefined;

  constructor(
    registry: ServiceRegistry,
    snapshots?: SnapshotCache
  ) {
    this.registry = registry;
    this.snapshots = snapshots;
  }

  async run(signal: AbortSignal): Promise<readonly AggregatedEntry[]> {
    const services = this.registry.all();
    return Promise.all(
      services.map(async (s) => {
        let result: HealthResult;
        try {
          // Serve the poller-published snapshot; only probe live before the
          // first poll has completed (e.g. right after startup/registration).
          result = this.snapshots
            ? await this.snapshots.readHealth(s, signal)
            : await s.checkHealth(signal);
        } catch (err) {
          result = { ok: false, error: toUnavailable(err) };
        }
        return { id: s.id, kind: s.kind, instanceId: s.instanceId, result };
      })
    );
  }
}

function toUnavailable(reason: unknown): UnavailableError {
  const msg = reason instanceof Error ? reason.message : String(reason);
  return new UnavailableError(msg);
}
