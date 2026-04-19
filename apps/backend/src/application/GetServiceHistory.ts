import type { ServiceRegistry } from '../domain/ServiceRegistry.js';
import type {
  TimeSeriesReader,
  Resolution,
  Aggregation,
  HistoryPoint,
} from '../infra/timeseries/TimeSeriesReader.js';
import { autoResolution } from '../infra/timeseries/TimeSeriesReader.js';
import { NotFoundError, ValidationError, type DomainError } from '../core/errors.js';
import { err, ok, type Result } from '../core/result.js';

export interface HistoryPayload {
  kind: string;
  instance: string | null;
  metric: string;
  resolution: Resolution;
  points: HistoryPoint[];
}

export interface GetServiceHistoryInput {
  kind: string;
  instance?: string | undefined;
  metric: string;
  from: Date;
  to: Date;
  resolution?: Resolution | undefined;
  agg?: Aggregation | undefined;
  limit?: number | undefined;
}

export interface GetServiceHistoryDeps {
  registry: ServiceRegistry;
  reader: TimeSeriesReader;
}

const MAX_RANGE_MS = 30 * 24 * 3_600_000;
const MAX_LIMIT = 20_000;

export class GetServiceHistory {
  constructor(private readonly deps: GetServiceHistoryDeps) {}

  async run(input: GetServiceHistoryInput): Promise<Result<HistoryPayload, DomainError>> {
    const { kind, instance, metric, from, to } = input;

    if (!kind) return err(new ValidationError('kind required'));
    if (!metric || typeof metric !== 'string') return err(new ValidationError('metric required'));
    if (!(from instanceof Date) || Number.isNaN(from.getTime())) return err(new ValidationError('invalid from'));
    if (!(to instanceof Date) || Number.isNaN(to.getTime())) return err(new ValidationError('invalid to'));
    if (from.getTime() >= to.getTime()) return err(new ValidationError('from must be < to'));
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
      return err(new ValidationError('range exceeds 30 days'));
    }

    const kinds = this.deps.registry.kinds();
    if (!kinds.includes(kind)) return err(new NotFoundError(`no instances for kind: ${kind}`));
    if (instance) {
      const list = this.deps.registry.listKind(kind);
      if (!list.some((s) => s.instanceId === instance)) {
        return err(new NotFoundError(`instance not found: ${kind}:${instance}`));
      }
    }

    const resolution: Resolution = input.resolution ?? autoResolution(from.getTime(), to.getTime());
    const limit = input.limit == null ? undefined : Math.max(1, Math.min(MAX_LIMIT, Math.floor(input.limit)));

    const points = await this.deps.reader.query({
      kind,
      instanceId: instance,
      metric,
      from,
      to,
      resolution,
      agg: input.agg,
      limit,
    });

    return ok({
      kind,
      instance: instance ?? null,
      metric,
      resolution,
      points,
    });
  }
}
