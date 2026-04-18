import type { ServiceRegistry } from '../domain/ServiceRegistry.js';
import type { HealthResult } from '../domain/BaseService.js';

export interface AggregatedEntry {
  id: string;
  kind: string;
  instanceId: string;
  result: HealthResult;
}

export class GetAggregatedHealth {
  constructor(private readonly registry: ServiceRegistry) {}

  async run(signal: AbortSignal): Promise<readonly AggregatedEntry[]> {
    const services = this.registry.all();
    const settled = await Promise.allSettled(
      services.map((s) => s.checkHealth(signal)),
    );
    return services.map((s, i) => {
      const r = settled[i]!;
      const result: HealthResult = r.status === 'fulfilled'
        ? r.value
        : { ok: false, error: toUnavailable(r.reason) };
      return { id: s.id, kind: s.kind, instanceId: s.instanceId, result };
    });
  }
}

import { UnavailableError } from '../core/errors.js';

function toUnavailable(reason: unknown): UnavailableError {
  const msg = reason instanceof Error ? reason.message : String(reason);
  return new UnavailableError(msg);
}
