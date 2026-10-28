import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Minimal EventEmitter (no import needed in vi.hoisted scope) ──────────────

const { clientInstances, MockClient } = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;

  class MiniEmitter {
    private _listeners: Record<string, Listener[]> = {};
    on(event: string, fn: Listener) { (this._listeners[event] ??= []).push(fn); return this; }
    once(event: string, fn: Listener) {
      const wrapper = (...args: unknown[]) => { fn(...args); this.off(event, wrapper); };
      return this.on(event, wrapper);
    }
    off(event: string, fn: Listener) {
      this._listeners[event] = (this._listeners[event] ?? []).filter((l) => l !== fn);
      return this;
    }
    emit(event: string, ...args: unknown[]) {
      for (const fn of [...(this._listeners[event] ?? [])]) fn(...args);
      return true;
    }
    removeListener(event: string, fn: Listener) { return this.off(event, fn); }
    addEventListener(event: string, fn: Listener) { return this.on(event, fn); }
    removeEventListener(event: string, fn: Listener) { return this.off(event, fn); }
  }

  const instances: MockClient[] = [];

  class MockClient extends MiniEmitter {
    connect = vi.fn();
    exec = vi.fn();
    end = vi.fn();
    constructor() { super(); instances.push(this); }
    emitReady() { this.emit('ready'); }
    emitError(msg: string) { this.emit('error', new Error(msg)); }
    emitClose() { this.emit('close'); }
  }

  return { clientInstances: instances, MockClient };
});

vi.mock('ssh2', () => ({ Client: MockClient }));

// ─── Imports after mock ───────────────────────────────────────────────────────

import { createSshPool } from './sshPool.js';
import { UnavailableError, UnauthorizedError, TimeoutError } from '../../core/errors.js';
import type { SshExecRequest } from './sshExecutor.js';
import { hostKeyFingerprint } from './hostKey.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<SshExecRequest> = {}): SshExecRequest {
  return { host: '10.0.0.1', port: 22, user: 'pi', command: 'echo hi', timeoutMs: 1000, ...overrides };
}

type MockStream = { on: ReturnType<typeof vi.fn>; stderr: { on: ReturnType<typeof vi.fn> }; emit: (e: string, ...args: unknown[]) => void };
type ExecCb = (err: Error | null, stream?: MockStream) => void;

function makeStream(): MockStream {
  type Listener = (...args: unknown[]) => void;
  const listeners: Record<string, Listener[]> = {};
  const stderrListeners: Record<string, Listener[]> = {};

  const stream: MockStream = {
    on: vi.fn((event: string, fn: Listener) => { (listeners[event] ??= []).push(fn); }),
    stderr: { on: vi.fn((event: string, fn: Listener) => { (stderrListeners[event] ??= []).push(fn); }) },
    emit: (event, ...args) => {
      if (event === 'stderr:data') {
        for (const fn of stderrListeners['data'] ?? []) fn(...args);
      } else {
        for (const fn of listeners[event] ?? []) fn(...args);
      }
    },
  };
  return stream;
}

function mockExecSuccess(client: InstanceType<typeof MockClient>, stdout: string, exitCode = 0) {
  client.exec.mockImplementation((_cmd: string, cb: ExecCb) => {
    const stream = makeStream();
    cb(null, stream);
    stream.emit('data', Buffer.from(stdout));
    stream.emit('close', exitCode);
  });
}

function mockExecError(client: InstanceType<typeof MockClient>, msg: string) {
  client.exec.mockImplementation((_cmd: string, cb: ExecCb) => { cb(new Error(msg)); });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createSshPool', () => {
  beforeEach(() => {
    clientInstances.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('throws UnavailableError when host is missing', async () => {
    const pool = createSshPool();
    await expect(pool.exec(makeReq({ host: '' }))).rejects.toBeInstanceOf(UnavailableError);
  });

  it('throws UnavailableError when user is missing', async () => {
    const pool = createSshPool();
    await expect(pool.exec(makeReq({ user: '' }))).rejects.toBeInstanceOf(UnavailableError);
  });

  it('executes command and returns stdout + exit code', async () => {
    const pool = createSshPool();
    const execPromise = pool.exec(makeReq({ command: 'uname -r' }));

    const client = clientInstances[0]!;
    mockExecSuccess(client, 'linux-kernel\n');
    client.emitReady();

    const result = await execPromise;
    expect(result.stdout).toBe('linux-kernel\n');
    expect(result.code).toBe(0);
  });

  it('reuses existing connection for same host+user', async () => {
    const pool = createSshPool();
    const req = makeReq();

    const p1 = pool.exec(req);
    const p2 = pool.exec(req);

    const client = clientInstances[0]!;
    mockExecSuccess(client, 'result');
    client.emitReady();

    await Promise.all([p1, p2]);
    expect(clientInstances).toHaveLength(1);
  });

  it('queues pending execs and flushes them on ready', async () => {
    const pool = createSshPool();
    const results: number[] = [];

    const p1 = pool.exec(makeReq({ command: 'a' })).then(() => results.push(1));
    const p2 = pool.exec(makeReq({ command: 'b' })).then(() => results.push(2));

    const client = clientInstances[0]!;
    client.exec.mockImplementation((_cmd: string, cb: ExecCb) => {
      const stream = makeStream();
      cb(null, stream);
      stream.emit('data', Buffer.from(''));
      stream.emit('close', 0);
    });
    client.emitReady();

    await Promise.all([p1, p2]);
    expect(results).toHaveLength(2);
  });

  it('rejects queued execs with UnavailableError on connection error', async () => {
    const pool = createSshPool();
    const execPromise = pool.exec(makeReq());
    clientInstances[0]!.emitError('connection refused');
    await expect(execPromise).rejects.toBeInstanceOf(UnavailableError);
  });

  it('rejects queued execs with UnauthorizedError on auth error', async () => {
    const pool = createSshPool();
    const execPromise = pool.exec(makeReq());
    clientInstances[0]!.emitError('auth failed: Permission denied');
    await expect(execPromise).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects pending execs when pool is destroyed', async () => {
    const pool = createSshPool();
    const execPromise = pool.exec(makeReq());
    pool.destroy();
    await expect(execPromise).rejects.toBeInstanceOf(UnavailableError);
  });

  it('exec times out when command hangs', async () => {
    const pool = createSshPool();
    const execPromise = pool.exec(makeReq({ timeoutMs: 100 }));

    const client = clientInstances[0]!;
    client.exec.mockImplementation((_cmd: string, cb: ExecCb) => {
      const stream = makeStream();
      cb(null, stream);
      // Never emits 'close'
    });
    client.emitReady();

    vi.advanceTimersByTime(200);
    await expect(execPromise).rejects.toBeInstanceOf(TimeoutError);
  });

  it('abort signal cancels exec', async () => {
    const pool = createSshPool();
    const ac = new AbortController();
    const execPromise = pool.exec(makeReq({ timeoutMs: 5000, signal: ac.signal }));

    const client = clientInstances[0]!;
    client.exec.mockImplementation((_cmd: string, cb: ExecCb) => {
      const stream = makeStream();
      cb(null, stream);
      // Never emits 'close'
    });
    client.emitReady();

    ac.abort();
    await expect(execPromise).rejects.toBeInstanceOf(TimeoutError);
  });

  it('exec rejects with UnavailableError when ssh2 exec() fails', async () => {
    const pool = createSshPool();
    const execPromise = pool.exec(makeReq());

    const client = clientInstances[0]!;
    mockExecError(client, 'exec channel failed');
    client.emitReady();

    await expect(execPromise).rejects.toBeInstanceOf(UnavailableError);
  });

  it('captures stderr output in result', async () => {
    const pool = createSshPool();
    const execPromise = pool.exec(makeReq());

    const client = clientInstances[0]!;
    client.exec.mockImplementation((_cmd: string, cb: ExecCb) => {
      const stream = makeStream();
      cb(null, stream);
      stream.emit('stderr:data', Buffer.from('error output'));
      stream.emit('close', 1);
    });
    client.emitReady();

    const result = await execPromise;
    expect(result.stderr).toBe('error output');
    expect(result.code).toBe(1);
  });

  it('destroy() ends all connections and rejects all pending', async () => {
    const pool = createSshPool();
    const p1 = pool.exec(makeReq({ host: 'host1', user: 'u1' }));
    const p2 = pool.exec(makeReq({ host: 'host2', user: 'u2' }));

    pool.destroy();

    await expect(p1).rejects.toBeInstanceOf(UnavailableError);
    await expect(p2).rejects.toBeInstanceOf(UnavailableError);
    expect(clientInstances[0]!.end).toHaveBeenCalled();
    expect(clientInstances[1]!.end).toHaveBeenCalled();
  });
  it('does not reconnect in the background after a failure (error + close)', async () => {
    // regression: ssh2 emits both 'error' and 'close' for one failure; each
    // used to schedule its own reconnect, multiplying connect attempts
    const pool = createSshPool();
    const execPromise = pool.exec(makeReq());
    const client = clientInstances[0]!;
    client.emitError('connect ECONNREFUSED');
    client.emitClose();
    await expect(execPromise).rejects.toBeInstanceOf(UnavailableError);

    vi.advanceTimersByTime(30_000);
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(clientInstances).toHaveLength(1);

    // the next exec opens a fresh connection
    const next = pool.exec(makeReq());
    expect(clientInstances).toHaveLength(2);
    mockExecSuccess(clientInstances[1]!, 'ok');
    clientInstances[1]!.emitReady();
    await expect(next).resolves.toMatchObject({ stdout: 'ok', code: 0 });
  });

  it('rejects queued execs when the connection closes before ready', async () => {
    const pool = createSshPool();
    const execPromise = pool.exec(makeReq());
    clientInstances[0]!.emitClose();
    await expect(execPromise).rejects.toBeInstanceOf(UnavailableError);
  });

  it('queued exec honours its timeout while the connection is not ready', async () => {
    const pool = createSshPool();
    const execPromise = pool.exec(makeReq({ timeoutMs: 100 }));
    vi.advanceTimersByTime(150);
    await expect(execPromise).rejects.toBeInstanceOf(TimeoutError);
  });

  it('queued exec honours its abort signal while the connection is not ready', async () => {
    const pool = createSshPool();
    const ac = new AbortController();
    const execPromise = pool.exec(makeReq({ timeoutMs: 5000, signal: ac.signal }));
    ac.abort();
    await expect(execPromise).rejects.toBeInstanceOf(TimeoutError);
  });

  it('opens a new connection when the password changes', async () => {
    const pool = createSshPool();
    const p1 = pool.exec(makeReq({ password: 'old' }));
    const p2 = pool.exec(makeReq({ password: 'new' }));
    expect(clientInstances).toHaveLength(2);
    expect(clientInstances[0]!.end).toHaveBeenCalled();
    await expect(p1).rejects.toBeInstanceOf(UnavailableError);
    expect(clientInstances[1]!.connect).toHaveBeenCalledWith(expect.objectContaining({ password: 'new' }));
    mockExecSuccess(clientInstances[1]!, 'ok');
    clientInstances[1]!.emitReady();
    await expect(p2).resolves.toMatchObject({ stdout: 'ok' });
  });

  it('rejects when the channel closes without an exit status (truncated output)', async () => {
    const pool = createSshPool();
    const execPromise = pool.exec(makeReq());
    const client = clientInstances[0]!;
    client.exec.mockImplementation((_cmd: string, cb: ExecCb) => {
      const stream = makeStream();
      cb(null, stream);
      stream.emit('data', Buffer.from('partial'));
      stream.emit('close');
    });
    client.emitReady();
    await expect(execPromise).rejects.toBeInstanceOf(UnavailableError);
  });

  it('rejects when the command is killed by a signal', async () => {
    const pool = createSshPool();
    const execPromise = pool.exec(makeReq());
    const client = clientInstances[0]!;
    client.exec.mockImplementation((_cmd: string, cb: ExecCb) => {
      const stream = makeStream();
      cb(null, stream);
      stream.emit('close', null, 'KILL');
    });
    client.emitReady();
    await expect(execPromise).rejects.toThrow(/signal KILL/);
  });

  it('decodes multi-byte UTF-8 split across data chunks', async () => {
    const pool = createSshPool();
    const execPromise = pool.exec(makeReq());
    const client = clientInstances[0]!;
    const bytes = Buffer.from('Küche', 'utf8');
    client.exec.mockImplementation((_cmd: string, cb: ExecCb) => {
      const stream = makeStream();
      cb(null, stream);
      stream.emit('data', bytes.subarray(0, 2));
      stream.emit('data', bytes.subarray(2));
      stream.emit('close', 0);
    });
    client.emitReady();
    await expect(execPromise).resolves.toMatchObject({ stdout: 'Küche' });
  });

  it('closes the channel of a command that times out', async () => {
    const pool = createSshPool();
    const execPromise = pool.exec(makeReq({ timeoutMs: 100 }));

    const client = clientInstances[0]!;
    const close = vi.fn();
    client.exec.mockImplementation((_cmd: string, cb: ExecCb) => {
      cb(null, Object.assign(makeStream(), { close }));
    });
    client.emitReady();

    vi.advanceTimersByTime(200);
    await expect(execPromise).rejects.toBeInstanceOf(TimeoutError);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes the channel of an aborted command', async () => {
    const pool = createSshPool();
    const ac = new AbortController();
    const execPromise = pool.exec(makeReq({ timeoutMs: 5000, signal: ac.signal }));

    const client = clientInstances[0]!;
    const close = vi.fn();
    client.exec.mockImplementation((_cmd: string, cb: ExecCb) => {
      cb(null, Object.assign(makeStream(), { close }));
    });
    client.emitReady();

    ac.abort();
    await expect(execPromise).rejects.toBeInstanceOf(TimeoutError);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes a channel that opens after the exec already timed out', async () => {
    const pool = createSshPool();
    const execPromise = pool.exec(makeReq({ timeoutMs: 100 }));

    const client = clientInstances[0]!;
    let openChannel: (() => void) | undefined;
    const close = vi.fn();
    client.exec.mockImplementation((_cmd: string, cb: ExecCb) => {
      openChannel = () => cb(null, Object.assign(makeStream(), { close }));
    });
    client.emitReady();

    vi.advanceTimersByTime(200);
    await expect(execPromise).rejects.toBeInstanceOf(TimeoutError);
    openChannel?.();
    expect(close).toHaveBeenCalledTimes(1);
  });

  describe('host key pinning', () => {
    const HOST_KEY = Buffer.from('pinned host key blob');
    const PIN = hostKeyFingerprint(HOST_KEY);
    type ConnectOpts = { hostVerifier?: (key: Buffer) => boolean };
    const verifierOf = (client: InstanceType<typeof MockClient>) =>
      (client.connect.mock.calls[0]![0] as ConnectOpts).hostVerifier;

    it('sets no host verifier when no fingerprint is pinned', () => {
      const pool = createSshPool();
      void pool.exec(makeReq()).catch(() => undefined);
      expect(verifierOf(clientInstances[0]!)).toBeUndefined();
      pool.destroy();
    });

    it('connects when the server presents the pinned key', async () => {
      const pool = createSshPool();
      const execPromise = pool.exec(makeReq({ hostKey: PIN }));
      const client = clientInstances[0]!;
      expect(verifierOf(client)!(HOST_KEY)).toBe(true);
      mockExecSuccess(client, 'ok');
      client.emitReady();
      await expect(execPromise).resolves.toMatchObject({ stdout: 'ok' });
    });

    it('refuses any other key with UnauthorizedError naming both fingerprints', async () => {
      const pool = createSshPool();
      const execPromise = pool.exec(makeReq({ hostKey: PIN }));
      const client = clientInstances[0]!;
      const impostor = Buffer.from('impostor host key blob');
      expect(verifierOf(client)!(impostor)).toBe(false);
      // ssh2 reports the refusal as a generic handshake error, then closes
      client.emitError('Handshake failed: host key verification failed');
      client.emitClose();
      const error = await execPromise.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect((error as Error).message).toContain(PIN);
      expect((error as Error).message).toContain(hostKeyFingerprint(impostor));
      expect(client.exec).not.toHaveBeenCalled();
    });

    it('opens a new connection when the pinned fingerprint changes', async () => {
      const pool = createSshPool();
      const p1 = pool.exec(makeReq());
      const p2 = pool.exec(makeReq({ hostKey: PIN }));
      expect(clientInstances).toHaveLength(2);
      await expect(p1).rejects.toBeInstanceOf(UnavailableError);
      expect(verifierOf(clientInstances[1]!)).toBeTypeOf('function');
      mockExecSuccess(clientInstances[1]!, 'ok');
      clientInstances[1]!.emitReady();
      await expect(p2).resolves.toMatchObject({ stdout: 'ok' });
    });
  });
});
