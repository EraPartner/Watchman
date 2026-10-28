import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFileRoonStateStore,
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

describe('Roon pairing state', () => {
  it('passes persisted-state hooks backed by the store, keyed per Core', async () => {
    const fake = makeFakeRoonApi();
    const saved = new Map<string, unknown>();
    await createRoonConnect({
      RoonApi: fake.RoonApi,
      stateStore: { get: (k) => saved.get(k), set: (k, v) => void saved.set(k, v) },
    })(connectOpts);
    const o = fake.options();
    expect(o.get_persisted_state?.()).toEqual({});
    o.set_persisted_state?.({ tokens: { 'core-1': 't' } });
    expect(saved.get('10.0.0.5:9330')).toEqual({ tokens: { 'core-1': 't' } });
    expect(o.get_persisted_state?.()).toEqual({ tokens: { 'core-1': 't' } });
  });

  it('file store round-trips with owner-only permissions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'roon-state-'));
    const file = join(dir, 'sub', 'roon-state.json');
    const store = createFileRoonStateStore(file, join(dir, 'missing.json'));
    expect(store.get('a:1')).toBeUndefined();
    store.set('a:1', { tokens: { c: 'x' } });
    store.set('b:2', { tokens: { d: 'y' } });
    expect(store.get('a:1')).toEqual({ tokens: { c: 'x' } });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveProperty('b:2');
    if (process.platform !== 'win32') {
      expect(statSync(file).mode & 0o777).toBe(0o600);
    }
  });

  it('file store falls back to the roonstate older versions left in config.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'roon-state-'));
    const legacy = join(dir, 'config.json');
    writeFileSync(legacy, JSON.stringify({ roonstate: { tokens: { c: 'old' } } }));
    const store = createFileRoonStateStore(join(dir, 'roon-state.json'), legacy);
    expect(store.get('a:1')).toEqual({ tokens: { c: 'old' } });
  });
});
