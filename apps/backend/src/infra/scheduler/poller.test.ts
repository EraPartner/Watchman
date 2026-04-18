import { describe, it, expect, vi } from 'vitest';
import { createBackgroundPoller } from './poller.js';
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
  checkHealth(): Promise<HealthResult> {
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
});
