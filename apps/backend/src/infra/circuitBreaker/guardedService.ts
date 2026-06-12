import {
  BaseService,
  isControllable,
  type Controllable,
  type HealthResult,
  type StatsResult,
  type PollPolicy,
} from "../../domain/BaseService.js";
import {
  isDomainError,
  UnavailableError,
  type DomainError,
} from "../../core/errors.js";
import { err, type Result } from "../../core/result.js";
import type { Breaker } from "./breaker.js";

export interface ServiceBreakers {
  health: Breaker;
  stats: Breaker;
}

// The breaker counts Result errors as failures by rethrowing them through
// exec(); callers still receive a plain Result (CIRCUIT_OPEN maps to an err).
async function execResult<T>(
  breaker: Breaker,
  fn: () => Promise<Result<T, DomainError>>,
  signal: AbortSignal
): Promise<Result<T, DomainError>> {
  try {
    return await breaker.exec(async () => {
      const res = await fn();
      if (!res.ok) throw res.error;
      return res;
    }, signal);
  } catch (e) {
    if (isDomainError(e)) return err(e);
    return err(
      new UnavailableError(e instanceof Error ? e.message : String(e))
    );
  }
}

class BreakerGuardedService extends BaseService {
  readonly kind: string;
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;

  constructor(
    private readonly inner: BaseService,
    private readonly breakers: ServiceBreakers
  ) {
    super();
    this.kind = inner.kind;
    this.instanceId = inner.instanceId;
    this.pollPolicy = inner.pollPolicy;
    if (inner.onStart) this.onStart = () => inner.onStart!();
    if (inner.onStop) this.onStop = () => inner.onStop!();
    if (isControllable(inner)) {
      // control is user-initiated, not polled; pass through unguarded
      (this as BaseService & Partial<Controllable>).control = (
        action,
        signal
      ) => inner.control(action, signal);
    }
  }

  override onStart?: () => Promise<void>;
  override onStop?: () => Promise<void>;

  checkHealth(signal: AbortSignal): Promise<HealthResult> {
    return execResult(
      this.breakers.health,
      () => this.inner.checkHealth(signal),
      signal
    );
  }

  getStats(signal: AbortSignal): Promise<StatsResult> {
    return execResult(
      this.breakers.stats,
      () => this.inner.getStats(signal),
      signal
    );
  }
}

/**
 * Wrap a service's polled network calls in per-operation circuit breakers so
 * a hard-down service is probed at the breaker's reset cadence instead of
 * full poll rate. Health and stats get separate breakers so a stats-only
 * failure (e.g. bad credentials) cannot blind the health check.
 */
export function withBreakers(
  inner: BaseService,
  breakers: ServiceBreakers
): BaseService {
  return new BreakerGuardedService(inner, breakers);
}
