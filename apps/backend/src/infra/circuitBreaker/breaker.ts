import { CircuitOpenError } from '../../core/errors.js';
import type { Clock } from '../../core/clock.js';

export type BreakerState = 'closed' | 'open' | 'half-open';

export interface BreakerPolicy {
  failureThreshold: number;
  resetAfterMs: number;
  halfOpenMaxCalls?: number;
}

export interface BreakerMetrics {
  state: BreakerState;
  failures: number;
  successes: number;
  rejects: number;
  trips: number;
  openedAt: number | null;
}

export interface Breaker {
  exec<T>(fn: (signal?: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T>;
  metrics(): BreakerMetrics;
  name: string;
}

export function createBreaker(name: string, policy: BreakerPolicy, clock: Clock): Breaker {
  let state: BreakerState = 'closed';
  let consecutiveFailures = 0;
  let openedAt: number | null = null;
  let halfOpenInFlight = 0;
  const m = { failures: 0, successes: 0, rejects: 0, trips: 0 };
  const halfOpenMax = policy.halfOpenMaxCalls ?? 1;

  const trip = (): void => {
    state = 'open';
    openedAt = clock.now();
    m.trips++;
  };

  const tryAcquire = (): boolean => {
    if (state === 'closed') return true;
    if (state === 'open') {
      if (openedAt !== null && clock.now() - openedAt >= policy.resetAfterMs) {
        state = 'half-open';
        halfOpenInFlight = 0;
      } else {
        return false;
      }
    }
    if (halfOpenInFlight >= halfOpenMax) return false;
    halfOpenInFlight++;
    return true;
  };

  return {
    name,
    async exec(fn, signal) {
      if (!tryAcquire()) {
        m.rejects++;
        throw new CircuitOpenError(`circuit open: ${name}`);
      }
      const acquiredHalfOpen = state === 'half-open';
      try {
        const result = await fn(signal);
        m.successes++;
        if (state === 'half-open') {
          state = 'closed';
          consecutiveFailures = 0;
          openedAt = null;
          halfOpenInFlight = 0;
        } else {
          consecutiveFailures = 0;
        }
        return result;
      } catch (e) {
        m.failures++;
        consecutiveFailures++;
        if (state === 'half-open') {
          trip();
          halfOpenInFlight = 0;
        } else if (consecutiveFailures >= policy.failureThreshold) {
          trip();
        } else if (acquiredHalfOpen && halfOpenInFlight > 0) {
          halfOpenInFlight--;
        }
        throw e;
      }
    },
    metrics(): BreakerMetrics {
      return {
        state,
        failures: m.failures,
        successes: m.successes,
        rejects: m.rejects,
        trips: m.trips,
        openedAt,
      };
    },
  };
}
