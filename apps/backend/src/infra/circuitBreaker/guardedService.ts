import {
  BaseService,
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

// Failures that only the user can fix (bad credentials or config). While the
// breaker is open because of one, callers keep seeing it instead of
// CIRCUIT_OPEN, so the UI still asks for configuration.
const CONFIG_ERROR_CODES: ReadonlySet<string> = new Set([
  "UNAUTHORIZED",
  "VALIDATION",
]);

interface Lane {
  breaker: Breaker;
  /** The inner service's most recent failure; cleared by a success. */
  lastError: DomainError | undefined;
}

// The breaker counts Result errors as failures by rethrowing them through
// exec(); callers still receive a plain Result (CIRCUIT_OPEN maps to an err).
async function execResult<T>(
  lane: Lane,
  fn: () => Promise<Result<T, DomainError>>,
  signal: AbortSignal
): Promise<Result<T, DomainError>> {
  // Set once the breaker lets the call through to the inner service.
  const call = { reached: false };
  try {
    return await lane.breaker.exec(async () => {
      call.reached = true;
      const res = await fn();
      if (!res.ok) throw res.error;
      lane.lastError = undefined;
      return res;
    }, signal);
  } catch (e) {
    const error = isDomainError(e)
      ? e
      : new UnavailableError(e instanceof Error ? e.message : String(e));
    if (call.reached) {
      lane.lastError = error;
    } else if (
      error.code === "CIRCUIT_OPEN" &&
      lane.lastError !== undefined &&
      CONFIG_ERROR_CODES.has(lane.lastError.code)
    ) {
      // Still rejected without calling the service: the breaker keeps
      // protecting against login bans.
      return err(lane.lastError);
    }
    return err(error);
  }
}

class BreakerGuardedService extends BaseService {
  readonly kind: string;
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;

  private readonly health: Lane;
  private readonly stats: Lane;

  constructor(
    private readonly inner: BaseService,
    breakers: ServiceBreakers
  ) {
    super();
    this.health = { breaker: breakers.health, lastError: undefined };
    this.stats = { breaker: breakers.stats, lastError: undefined };
    this.kind = inner.kind;
    this.instanceId = inner.instanceId;
    this.pollPolicy = inner.pollPolicy;
    if (inner.onStart) this.onStart = () => inner.onStart!();
    if (inner.onStop) this.onStop = () => inner.onStop!();
  }

  override onStart?: () => Promise<void>;
  override onStop?: () => Promise<void>;

  checkHealth(signal: AbortSignal): Promise<HealthResult> {
    return execResult(
      this.health,
      () => this.inner.checkHealth(signal),
      signal
    );
  }

  getStats(signal: AbortSignal): Promise<StatsResult> {
    return execResult(
      this.stats,
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
