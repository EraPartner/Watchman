import { describe, it, expect, vi } from 'vitest';
import { createEventBus } from './eventBus.js';

describe('EventBus', () => {
  it('emits to registered handlers', () => {
    const bus = createEventBus();
    const h = vi.fn();
    bus.on('service.health.updated', h);
    bus.emit('service.health.updated', { id: 'a:1', kind: 'a', instanceId: '1', at: 0 });
    expect(h).toHaveBeenCalledOnce();
  });

  it('unsubscribes via returned fn', () => {
    const bus = createEventBus();
    const h = vi.fn();
    const off = bus.on('service.error', h);
    off();
    bus.emit('service.error', { id: 'a:1', kind: 'a', instanceId: '1', scope: 'health', error: new Error('x'), at: 0 });
    expect(h).not.toHaveBeenCalled();
  });

  it('no-op when event has no handlers', () => {
    const bus = createEventBus();
    expect(() => bus.emit('service.error', { id: 'x:1', kind: 'x', instanceId: '1', scope: 'health', error: null, at: 0 })).not.toThrow();
  });

  it('catches sync handler errors via onError', () => {
    const onError = vi.fn();
    const bus = createEventBus(onError);
    bus.on('service.error', () => {
      throw new Error('boom');
    });
    bus.emit('service.error', { id: 'x:1', kind: 'x', instanceId: '1', scope: 'health', error: null, at: 0 });
    expect(onError).toHaveBeenCalledOnce();
  });

  it('catches async handler rejections via onError', async () => {
    const onError = vi.fn();
    const bus = createEventBus(onError);
    bus.on('service.error', async () => {
      throw new Error('async boom');
    });
    bus.emit('service.error', { id: 'x:1', kind: 'x', instanceId: '1', scope: 'health', error: null, at: 0 });
    await new Promise((r) => setImmediate(r));
    expect(onError).toHaveBeenCalledOnce();
  });
});
