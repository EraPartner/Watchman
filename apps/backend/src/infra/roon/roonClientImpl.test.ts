import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createRoonConnect,
  type RoonApiConstructor,
  type RoonApiOptions,
  type RoonCore,
} from './roonClientImpl.js';

interface WsConnectCall {
  onclose?: () => void;
  onerror?: () => void;
  transportClose: ReturnType<typeof vi.fn>;
}

function makeFakeRoonApi() {
  const calls: WsConnectCall[] = [];
  let options: RoonApiOptions | undefined;
  const RoonApi = class {
    constructor(o: RoonApiOptions) {
      options = o;
    }
    init_services(): void {}
    ws_connect(o: { onclose?: () => void; onerror?: () => void }) {
      const transportClose = vi.fn();
      calls.push({ ...o, transportClose });
      return { transport: { close: transportClose } };
    }
  } as unknown as RoonApiConstructor;
  return { RoonApi, calls, options: () => options! };
}

function fakeCore(): RoonCore {
  return {
    core_id: 'core-1',
    display_name: 'Core',
    moo: {
      _subscribe_helper: (_s, _r, cb) => {
        cb('Subscribed', {
          zones: [{ zone_id: 'z1', display_name: 'Living Room', state: 'playing' }],
        });
        return { unsubscribe: () => undefined };
      },
      transport: { close: () => undefined },
    },
  };
}

const connectOpts = { host: '10.0.0.5', port: 9330, extensionId: 'x', displayName: 'X' };

describe('createRoonConnect reconnect', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reconnects after an open connection closes', async () => {
    // regression: ws_connect never reconnects, so a Core restart left the handle unpaired forever
    const fake = makeFakeRoonApi();
    const onZonesChanged = vi.fn();
    const handle = await createRoonConnect({ RoonApi: fake.RoonApi, reconnectDelayMs: 100 })({
      ...connectOpts,
      onZonesChanged,
    });
    fake.options().core_paired!(fakeCore());
    expect(handle.isPaired()).toBe(true);
    expect(handle.getZones()).toHaveLength(1);

    fake.calls[0]!.onclose!();
    expect(handle.isPaired()).toBe(false);
    expect(handle.getZones()).toHaveLength(0);
    expect(onZonesChanged).toHaveBeenLastCalledWith([]);

    vi.advanceTimersByTime(100);
    expect(fake.calls).toHaveLength(2);
    await handle.close();
  });

  it('retries when the first connection never opens (onerror only), with backoff', async () => {
    const fake = makeFakeRoonApi();
    const handle = await createRoonConnect({
      RoonApi: fake.RoonApi,
      reconnectDelayMs: 100,
      maxReconnectDelayMs: 300,
    })(connectOpts);

    fake.calls[0]!.onerror!();
    vi.advanceTimersByTime(100);
    expect(fake.calls).toHaveLength(2);

    fake.calls[1]!.onerror!();
    vi.advanceTimersByTime(199);
    expect(fake.calls).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(fake.calls).toHaveLength(3);

    fake.calls[2]!.onerror!();
    vi.advanceTimersByTime(300);
    expect(fake.calls).toHaveLength(4);
    await handle.close();
  });

  it('schedules a single reconnect when error and close both fire', async () => {
    const fake = makeFakeRoonApi();
    const handle = await createRoonConnect({ RoonApi: fake.RoonApi, reconnectDelayMs: 100 })(connectOpts);
    fake.calls[0]!.onerror!();
    fake.calls[0]!.onclose!();
    vi.advanceTimersByTime(1_000);
    expect(fake.calls).toHaveLength(2);
    await handle.close();
  });

  it('stops reconnecting once closed', async () => {
    const fake = makeFakeRoonApi();
    const handle = await createRoonConnect({ RoonApi: fake.RoonApi, reconnectDelayMs: 100 })(connectOpts);
    fake.calls[0]!.onclose!();
    await handle.close();
    vi.advanceTimersByTime(10_000);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.transportClose).toHaveBeenCalled();
  });
});
