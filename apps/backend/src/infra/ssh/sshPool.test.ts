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
});
