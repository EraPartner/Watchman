import { describe, it, expect, vi } from 'vitest';
import { createBackgroundPoller, pollBudgetMs } from './poller.js';
import { createFakeClock } from '../../core/clock.js';
import { createEventBus } from '../../core/eventBus.js';
import { BaseService, type HealthResult, type StatsResult, type PollPolicy } from '../../domain/BaseService.js';
import { ok, err } from '../../core/result.js';
import { UnavailableError } from '../../core/errors.js';
import pino from 'pino';

const silentLogger = pino({ level: 'silent' });

class Stub extends BaseService {
  readonly kind = 'test';
  readonly instanceId = 'a';
  constructor(
    readonly pollPolicy: PollPolicy,
    readonly healthImpl: () => Promise<HealthResult>,
    readonly statsImpl: () => Promise<StatsResult> = async () => ok({ metrics: {}, at: 0 }),
  ) {
    super();
  }
  lastHealthSignal: AbortSignal | undefined;
  checkHealth(signal: AbortSignal): Promise<HealthResult> {
    this.lastHealthSignal = signal;
    return this.healthImpl();
  }
  getStats(): Promise<StatsResult> {
    return this.statsImpl();
  }
}

describe('BackgroundPoller', () => {
  it('emits health.updated on successful checkHealth tick', async () => {
    const clock = createFakeClock();
    const bus = createEventBus();
    const spy = vi.fn();
    bus.on('service.health.updated', spy);
    const svc = new Stub({ healthMs: 100, statsMs: 100, jitterRatio: 0 }, async () =>
      ok({ reachable: true, at: 0 }),
    );
    const poller = createBackgroundPoller({ clock, bus, logger: silentLogger });
    poller.track(svc);
    clock.advance(110);
    await new Promise((r) => setImmediate(r));
    expect(spy).toHaveBeenCalled();
    await poller.stop();
  });

  it('emits service.error when check fails', async () => {
    const clock = createFakeClock();
    const bus = createEventBus();
    const spy = vi.fn();
    bus.on('service.error', spy);
    const svc = new Stub({ healthMs: 100, statsMs: 100, jitterRatio: 0 }, async () =>
      err(new UnavailableError('down')),
    );
    const poller = createBackgroundPoller({ clock, bus, logger: silentLogger });
    poller.track(svc);
    clock.advance(110);
    await new Promise((r) => setImmediate(r));
    expect(spy).toHaveBeenCalled();
    await poller.stop();
  });

  it('stop cancels further ticks', async () => {
    const clock = createFakeClock();
    const bus = createEventBus();
    const spy = vi.fn();
    bus.on('service.health.updated', spy);
    const svc = new Stub({ healthMs: 50, statsMs: 50, jitterRatio: 0 }, async () =>
      ok({ reachable: true, at: 0 }),
    );
    const poller = createBackgroundPoller({ clock, bus, logger: silentLogger });
    poller.track(svc);
    expect(poller.isRunning(svc.id)).toBe(true);
    await poller.stop();
    expect(poller.isRunning(svc.id)).toBe(false);
    const before = spy.mock.calls.length;
    clock.advance(500);
    await new Promise((r) => setImmediate(r));
    expect(spy.mock.calls.length).toBe(before);
  });

  it('ignores duplicate track calls', () => {
    const clock = createFakeClock();
    const bus = createEventBus();
    const svc = new Stub({ healthMs: 100, statsMs: 100 }, async () =>
      ok({ reachable: true, at: 0 }),
    );
    const poller = createBackgroundPoller({ clock, bus, logger: silentLogger });
    poller.track(svc);
    poller.track(svc);
    expect(poller.isRunning(svc.id)).toBe(true);
  });

  it('does not publish a result that lands after untrack, and aborts the probe', async () => {
    const clock = createFakeClock();
    const bus = createEventBus();
    const health = vi.fn();
    const errors = vi.fn();
    bus.on('service.health.updated', health);
    bus.on('service.error', errors);
    let release!: (r: HealthResult) => void;
    const svc = new Stub({ healthMs: 100, statsMs: 1_000_000, jitterRatio: 0 }, async () =>
      new Promise<HealthResult>((r) => {
        release = r;
      }),
    );
    const poller = createBackgroundPoller({ clock, bus, logger: silentLogger });
    poller.track(svc);
    clock.advance(110);
    await new Promise((r) => setImmediate(r));
    expect(svc.lastHealthSignal?.aborted).toBe(false);

    // Edit/delete tears the service down while its probe is still in flight.
    poller.untrack(svc.id);
    expect(svc.lastHealthSignal?.aborted).toBe(true);
    release(ok({ reachable: true, at: 0 }));
    await new Promise((r) => setImmediate(r));

    expect(health).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });

  it('a re-tracked service only publishes its own results, not the old instance\'s', async () => {
    const clock = createFakeClock();
    const bus = createEventBus();
    const seen: Array<boolean> = [];
    bus.on('service.health.updated', (p) => {
      seen.push(p.snapshot!.reachable);
    });
    let releaseOld!: (r: HealthResult) => void;
    const oldSvc = new Stub({ healthMs: 100, statsMs: 1_000_000, jitterRatio: 0 }, async () =>
      new Promise<HealthResult>((r) => {
        releaseOld = r;
      }),
    );
    const newSvc = new Stub({ healthMs: 100, statsMs: 1_000_000, jitterRatio: 0 }, async () =>
      ok({ reachable: true, at: 0 }),
    );
    const poller = createBackgroundPoller({ clock, bus, logger: silentLogger });
    poller.track(oldSvc);
    clock.advance(110);
    await new Promise((r) => setImmediate(r));

    poller.untrack(oldSvc.id);
    poller.track(newSvc);
    clock.advance(110);
    await new Promise((r) => setImmediate(r));
    releaseOld(ok({ reachable: false, at: 0 }));
    await new Promise((r) => setImmediate(r));

    expect(seen).toEqual([true]);
    await poller.stop();
  });

  it('uses the per-service budget passed to track() for the probe timeout', async () => {
    const clock = createFakeClock();
    const bus = createEventBus();
    let reason: unknown;
    const svc = new Stub({ healthMs: 100, statsMs: 1_000_000, jitterRatio: 0 }, () =>
      new Promise<HealthResult>((resolve) => {
        const sig = svc.lastHealthSignal!;
        sig.addEventListener('abort', () => {
          reason = sig.reason;
          resolve(ok({ reachable: false, at: 0 }));
        });
      }),
    );
    const poller = createBackgroundPoller({ clock, bus, logger: silentLogger });
    poller.track(svc, 30);
    clock.advance(110);
    await new Promise((r) => setTimeout(r, 80));
    expect(String((reason as Error | undefined)?.message)).toContain('aborted after 30ms');
    await poller.stop();
  });
});

describe('pollBudgetMs', () => {
  it('allows two instance timeouts, never less than the default', () => {
    expect(pollBudgetMs(5_000)).toBe(10_000);
    expect(pollBudgetMs(2_000)).toBe(10_000);
    expect(pollBudgetMs(20_000)).toBe(40_000);
  });

  it('falls back to the default for a missing timeout', () => {
    expect(pollBudgetMs(undefined as unknown as number)).toBe(10_000);
  });
});
