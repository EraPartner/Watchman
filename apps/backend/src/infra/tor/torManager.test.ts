import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createTorManager, type TorConfig, type FsLike, type Clock, type SpawnLike } from './torManager.js';
import type { TcpProber } from '../net/tcpProbe.js';
import type { Logger } from '../../core/logger.js';

function fakeLogger(): Logger {
  const noop = () => undefined;
  return new Proxy({} as Logger, {
    get: () => noop,
  });
}

interface FakeChild extends EventEmitter {
  kill: (signal?: string) => boolean;
  killed: boolean;
  exitCode: number | null;
}

function fakeChild(): FakeChild {
  const ee = new EventEmitter() as FakeChild;
  ee.killed = false;
  ee.exitCode = null;
  ee.kill = vi.fn((_signal?: string) => {
    ee.killed = true;
    return true;
  });
  return ee;
}

function fakeSpawn(handler: (cmd: string, args: readonly string[]) => FakeChild | { child: FakeChild; exit?: number }): SpawnLike {
  return ((cmd: string, args: readonly string[]) => {
    const r = handler(cmd, args);
    const child = 'child' in r ? r.child : r;
    const exit = 'exit' in r ? r.exit : undefined;
    if (exit !== undefined) {
      queueMicrotask(() => child.emit('close', exit));
    }
    return child as unknown as ReturnType<SpawnLike>;
  }) as SpawnLike;
}

function fakeFs(): FsLike & { writes: Array<[string, string]>; unlinks: string[] } {
  const writes: Array<[string, string]> = [];
  const unlinks: string[] = [];
  return {
    writes,
    unlinks,
    async mkdir() {
      return undefined;
    },
    async writeFile(p, data) {
      writes.push([p, data]);
    },
    async unlink(p) {
      unlinks.push(p);
    },
  };
}

function fakeProber(result: boolean | (() => boolean)): TcpProber {
  return {
    async probe() {
      return typeof result === 'function' ? result() : result;
    },
  };
}

const baseCfg: TorConfig = {
  torPath: 'tor',
  socksPort: 9050,
  controlPort: 9051,
  dataDir: '/tmp/tor-data',
  startupTimeoutMs: 2000,
  probeTimeoutMs: 100,
  stopGraceMs: 50,
};

describe('torManager', () => {
  it('isInstalled true when which exits 0', async () => {
    const spawn = fakeSpawn((cmd) => (cmd === 'which' ? { child: fakeChild(), exit: 0 } : { child: fakeChild(), exit: 1 }));
    const mgr = createTorManager({
      config: baseCfg,
      spawn,
      fs: fakeFs(),
      tcpProber: fakeProber(false),
      logger: fakeLogger(),
    });
    expect(await mgr.isInstalled()).toBe(true);
  });

  it('isInstalled falls back to brew list on which failure', async () => {
    const spawn = fakeSpawn((cmd) => ({ child: fakeChild(), exit: cmd === 'brew' ? 0 : 1 }));
    const mgr = createTorManager({
      config: baseCfg,
      spawn,
      fs: fakeFs(),
      tcpProber: fakeProber(false),
      logger: fakeLogger(),
    });
    expect(await mgr.isInstalled()).toBe(true);
  });

  it('isInstalled false when both fail', async () => {
    const spawn = fakeSpawn(() => ({ child: fakeChild(), exit: 1 }));
    const mgr = createTorManager({
      config: baseCfg,
      spawn,
      fs: fakeFs(),
      tcpProber: fakeProber(false),
      logger: fakeLogger(),
    });
    expect(await mgr.isInstalled()).toBe(false);
  });

  it('createTorConfig writes torrc with SocksPort and DataDirectory', async () => {
    const fs = fakeFs();
    const mgr = createTorManager({
      config: baseCfg,
      spawn: fakeSpawn(() => ({ child: fakeChild(), exit: 0 })),
      fs,
      tcpProber: fakeProber(false),
      logger: fakeLogger(),
    });
    const p = await mgr.createTorConfig();
    expect(p).toBe('/tmp/tor-data/torrc');
    expect(fs.writes).toHaveLength(1);
    const [, content] = fs.writes[0]!;
    expect(content).toContain('SocksPort 9050');
    expect(content).toContain('ControlPort 9051');
    expect(content).toContain('DataDirectory /tmp/tor-data');
  });

  it('isRunning returns true when port probe succeeds', async () => {
    const mgr = createTorManager({
      config: baseCfg,
      spawn: fakeSpawn(() => ({ child: fakeChild(), exit: 0 })),
      fs: fakeFs(),
      tcpProber: fakeProber(true),
      logger: fakeLogger(),
    });
    expect(await mgr.isRunning()).toBe(true);
  });

  it('startTor short-circuits true when already running', async () => {
    const mgr = createTorManager({
      config: baseCfg,
      spawn: fakeSpawn(() => ({ child: fakeChild(), exit: 0 })),
      fs: fakeFs(),
      tcpProber: fakeProber(true),
      logger: fakeLogger(),
    });
    expect(await mgr.startTor()).toBe(true);
  });

  it('startTor spawns tor and returns true when port opens', async () => {
    let probeCalls = 0;
    const prober: TcpProber = {
      async probe() {
        probeCalls++;
        return probeCalls > 2;
      },
    };
    const clock: Clock = { now: () => 0, sleep: async () => undefined };
    const spawnCalls: string[] = [];
    const spawn = fakeSpawn((cmd) => {
      spawnCalls.push(cmd);
      if (cmd === 'which') return { child: fakeChild(), exit: 0 };
      return fakeChild();
    });
    const mgr = createTorManager({
      config: baseCfg,
      spawn,
      fs: fakeFs(),
      tcpProber: prober,
      logger: fakeLogger(),
      clock,
    });
    const ok = await mgr.startTor();
    expect(ok).toBe(true);
    expect(spawnCalls).toContain('tor');
  });

  it('startTor returns false on timeout and cleans up', async () => {
    let t = 0;
    const clock: Clock = {
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
    };
    const child = fakeChild();
    const spawn = fakeSpawn((cmd) => {
      if (cmd === 'which') return { child: fakeChild(), exit: 0 };
      return child;
    });
    const mgr = createTorManager({
      config: { ...baseCfg, startupTimeoutMs: 500, stopGraceMs: 10 },
      spawn,
      fs: fakeFs(),
      tcpProber: fakeProber(false),
      logger: fakeLogger(),
      clock,
    });
    const ok = await mgr.startTor();
    expect(ok).toBe(false);
    expect(child.kill).toHaveBeenCalled();
  });

  it('startTor returns false when install fails', async () => {
    const spawn = fakeSpawn((cmd) => {
      if (cmd === 'which' || cmd === 'brew') return { child: fakeChild(), exit: 1 };
      return fakeChild();
    });
    const mgr = createTorManager({
      config: baseCfg,
      spawn,
      fs: fakeFs(),
      tcpProber: fakeProber(false),
      logger: fakeLogger(),
    });
    expect(await mgr.startTor()).toBe(false);
  });

  it('stopTor sends SIGTERM then resolves on exit', async () => {
    const child = fakeChild();
    const spawn = fakeSpawn((cmd) => {
      if (cmd === 'which') return { child: fakeChild(), exit: 0 };
      return child;
    });
    let running = false;
    const prober: TcpProber = {
      async probe() {
        const was = running;
        running = true;
        return was;
      },
    };
    const clock: Clock = { now: () => 0, sleep: async () => undefined };
    const mgr = createTorManager({
      config: baseCfg,
      spawn,
      fs: fakeFs(),
      tcpProber: prober,
      logger: fakeLogger(),
      clock,
    });
    await mgr.startTor();
    const stopP = mgr.stopTor();
    queueMicrotask(() => child.emit('exit'));
    await stopP;
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('stopTor SIGKILL after grace when process refuses exit', async () => {
    const child = fakeChild();
    child.kill = vi.fn(() => true);
    const spawn = fakeSpawn((cmd) => {
      if (cmd === 'which') return { child: fakeChild(), exit: 0 };
      return child;
    });
    let running = false;
    const prober: TcpProber = {
      async probe() {
        const was = running;
        running = true;
        return was;
      },
    };
    const clock: Clock = { now: () => 0, sleep: async () => undefined };
    const mgr = createTorManager({
      config: { ...baseCfg, stopGraceMs: 5 },
      spawn,
      fs: fakeFs(),
      tcpProber: prober,
      logger: fakeLogger(),
      clock,
    });
    await mgr.startTor();
    await mgr.stopTor();
    const calls = (child.kill as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.some((c) => c[0] === 'SIGKILL')).toBe(true);
  });

  it('cleanup unlinks torrc and ignores missing file', async () => {
    const fs = fakeFs();
    fs.unlink = vi.fn(async () => {
      throw new Error('ENOENT');
    });
    const mgr = createTorManager({
      config: baseCfg,
      spawn: fakeSpawn(() => ({ child: fakeChild(), exit: 0 })),
      fs,
      tcpProber: fakeProber(false),
      logger: fakeLogger(),
    });
    await expect(mgr.cleanup()).resolves.toBeUndefined();
  });

  it('checkHealth reports online with port and unmanaged when no process', async () => {
    const mgr = createTorManager({
      config: baseCfg,
      spawn: fakeSpawn(() => ({ child: fakeChild(), exit: 0 })),
      fs: fakeFs(),
      tcpProber: fakeProber(true),
      logger: fakeLogger(),
    });
    const h = await mgr.checkHealth();
    expect(h.status).toBe('online');
    expect(h.port).toBe(9050);
    expect(h.isManaged).toBe(false);
  });

  it('installTor succeeds when brew install exits 0', async () => {
    const spawn = fakeSpawn(() => ({ child: fakeChild(), exit: 0 }));
    const mgr = createTorManager({
      config: baseCfg,
      spawn,
      fs: fakeFs(),
      tcpProber: fakeProber(false),
      logger: fakeLogger(),
    });
    expect(await mgr.installTor()).toBe(true);
  });

  it('initialize returns true', async () => {
    const mgr = createTorManager({
      config: baseCfg,
      spawn: fakeSpawn(() => ({ child: fakeChild(), exit: 1 })),
      fs: fakeFs(),
      tcpProber: fakeProber(false),
      logger: fakeLogger(),
    });
    expect(await mgr.initialize()).toBe(true);
  });
});
