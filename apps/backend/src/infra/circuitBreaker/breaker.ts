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

  const canAttempt = (): boolean => {
    if (state === 'closed') return true;
    if (state === 'open') {
      if (openedAt !== null && clock.now() - openedAt >= policy.resetAfterMs) {
        state = 'half-open';
        halfOpenInFlight = 0;
        return halfOpenInFlight < halfOpenMax;
      }
      return false;
    }
    return halfOpenInFlight < halfOpenMax;
  };

  return {
    name,
    async exec(fn, signal) {
      if (!canAttempt()) {
        m.rejects++;
        throw new CircuitOpenError(`circuit open: ${name}`);
      }
      if (state === 'half-open') halfOpenInFlight++;
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
        }
        throw e;
      }
    },
    metrics() {
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
