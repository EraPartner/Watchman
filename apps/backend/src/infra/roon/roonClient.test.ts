import { describe, it, expect, vi } from 'vitest';
import type { RoonConnectFn, RoonHandle, RoonZone } from './roonClient.js';

// ─── Fake factory ──────────────────────────────────────────────────────────────

interface FakeRoonControl {
  connect: RoonConnectFn;
  simulatePair(zones: RoonZone[]): void;
  simulateZoneChange(zones: RoonZone[]): void;
  simulateUnpair(): void;
}

function makeFakeRoon(): FakeRoonControl {
  let handle: {
    zones: Map<string, RoonZone>;
    paired: boolean;
    onZonesChanged?: (z: ReadonlyArray<RoonZone>) => void;
    closed: boolean;
  } | null = null;

  const connect: RoonConnectFn = async (opts) => {
    handle = {
      zones: new Map(),
      paired: false,
      onZonesChanged: opts.onZonesChanged,
      closed: false,
    };
    const h: RoonHandle = {
      getZones: () => (handle ? Array.from(handle.zones.values()) : []),
      isPaired: () => handle?.paired ?? false,
      close: async () => {
        if (handle) {
          handle.zones.clear();
          handle.paired = false;
          handle.closed = true;
        }
      },
    };
    return h;
  };

  return {
    connect,
    simulatePair(zones) {
      if (!handle) throw new Error('Not connected');
      handle.paired = true;
      handle.zones.clear();
      for (const z of zones) handle.zones.set(z.zoneId, z);
      handle.onZonesChanged?.(Array.from(handle.zones.values()));
    },
    simulateZoneChange(zones) {
      if (!handle) throw new Error('Not connected');
      for (const z of zones) handle.zones.set(z.zoneId, z);
      handle.onZonesChanged?.(Array.from(handle.zones.values()));
    },
    simulateUnpair() {
      if (!handle) throw new Error('Not connected');
      handle.paired = false;
      handle.zones.clear();
      handle.onZonesChanged?.([]);
    },
  };
}

function makeZone(overrides: Partial<RoonZone> = {}): RoonZone {
  return {
    zoneId: 'zone-1',
    displayName: 'Living Room',
    state: 'stopped',
    queueItemsRemaining: 0,
    queueTimeRemaining: 0,
    outputCount: 1,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RoonHandle contract', () => {
  it('starts unpaired with no zones', async () => {
    const fake = makeFakeRoon();
    const h = await fake.connect({
      host: '192.168.1.20',
      port: 9100,
      extensionId: 'com.watchman.roon',
      displayName: 'Watchman',
    });
    expect(h.isPaired()).toBe(false);
    expect(h.getZones()).toHaveLength(0);
  });

  it('reflects paired state and zones after simulatePair', async () => {
    const fake = makeFakeRoon();
    const h = await fake.connect({
      host: '192.168.1.20',
      port: 9100,
      extensionId: 'com.watchman.roon',
      displayName: 'Watchman',
    });
    fake.simulatePair([makeZone({ state: 'playing' })]);
    expect(h.isPaired()).toBe(true);
    expect(h.getZones()).toHaveLength(1);
    expect(h.getZones()[0]!.state).toBe('playing');
  });

  it('fires onZonesChanged callback when zones update', async () => {
    const fake = makeFakeRoon();
    const cb = vi.fn();
    await fake.connect({
      host: '192.168.1.20',
      port: 9100,
      extensionId: 'com.watchman.roon',
      displayName: 'Watchman',
      onZonesChanged: cb,
    });
    fake.simulatePair([makeZone()]);
    expect(cb).toHaveBeenCalledOnce();
    expect(cb).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ zoneId: 'zone-1' })]));
  });

  it('updates zones on zone change', async () => {
    const fake = makeFakeRoon();
    const h = await fake.connect({
      host: '192.168.1.20',
      port: 9100,
      extensionId: 'com.watchman.roon',
      displayName: 'Watchman',
    });
    fake.simulatePair([makeZone({ state: 'stopped' })]);
    fake.simulateZoneChange([makeZone({ state: 'playing', nowPlaying: { oneLine: 'Yellow Submarine' } })]);
    expect(h.getZones()[0]!.state).toBe('playing');
    expect(h.getZones()[0]!.nowPlaying?.oneLine).toBe('Yellow Submarine');
  });

  it('clears zones and unpairs on simulateUnpair', async () => {
    const fake = makeFakeRoon();
    const h = await fake.connect({
      host: '192.168.1.20',
      port: 9100,
      extensionId: 'com.watchman.roon',
      displayName: 'Watchman',
    });
    fake.simulatePair([makeZone()]);
    fake.simulateUnpair();
    expect(h.isPaired()).toBe(false);
    expect(h.getZones()).toHaveLength(0);
  });

  it('close resolves without throwing', async () => {
    const fake = makeFakeRoon();
    const h = await fake.connect({
      host: '192.168.1.20',
      port: 9100,
      extensionId: 'com.watchman.roon',
      displayName: 'Watchman',
    });
    await expect(h.close()).resolves.toBeUndefined();
  });

  it('getZones returns empty array after close', async () => {
    const fake = makeFakeRoon();
    const h = await fake.connect({
      host: '192.168.1.20',
      port: 9100,
      extensionId: 'com.watchman.roon',
      displayName: 'Watchman',
    });
    fake.simulatePair([makeZone()]);
    await h.close();
    expect(h.getZones()).toHaveLength(0);
    expect(h.isPaired()).toBe(false);
  });
});
