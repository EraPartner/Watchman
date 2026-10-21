import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pino } from 'pino';
import { registerShutdown, runShutdownSteps } from './shutdown.js';

const silentLogger = pino({ level: 'silent' });
const EVENTS = ['SIGINT', 'SIGTERM', 'SIGHUP', 'disconnect'] as const;

describe('runShutdownSteps', () => {
  it('runs steps in order', async () => {
    const order: string[] = [];
    await runShutdownSteps(
      ['server', 'lifecycle', 'db'].map((name) => ({
        name,
        run: async () => {
          order.push(name);
        },
      })),
      silentLogger,
    );
    expect(order).toEqual(['server', 'lifecycle', 'db']);
  });

  it('keeps running later steps after one fails, then rejects', async () => {
    const dbClose = vi.fn();
    const p = runShutdownSteps(
      [
        { name: 'lifecycle', run: () => Promise.reject(new Error('boom')) },
        { name: 'snapshots', run: () => { throw new Error('sync boom'); } },
        { name: 'db', run: dbClose },
      ],
      silentLogger,
    );
    await expect(p).rejects.toBeInstanceOf(AggregateError);
    await expect(p).rejects.toMatchObject({ errors: [expect.any(Error), expect.any(Error)] });
    expect(dbClose).toHaveBeenCalledTimes(1);
  });
});

describe('registerShutdown', () => {
  let before: Map<string, ReturnType<typeof process.listeners>>;
  let exit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    before = new Map(EVENTS.map((e) => [e, process.listeners(e as NodeJS.Signals)]));
    exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    for (const e of EVENTS) {
      for (const l of process.listeners(e as NodeJS.Signals)) {
        if (!before.get(e)!.includes(l)) process.removeListener(e, l as never);
      }
    }
    exit.mockRestore();
    vi.useRealTimers();
  });

  it('exits 0 after a clean close', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    registerShutdown({ close }, silentLogger, { timeoutMs: 1_000 });
    process.emit('SIGTERM', 'SIGTERM');
    await vi.advanceTimersByTimeAsync(0);
    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    // The deadline was cleared: no forced exit afterwards.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('exits 1 when close rejects', async () => {
    registerShutdown({ close: () => Promise.reject(new Error('x')) }, silentLogger);
    process.emit('SIGINT', 'SIGINT');
    await vi.advanceTimersByTimeAsync(0);
    expect(exit).toHaveBeenCalledWith(1);
  });

  // Regression: a hung close() used to keep the process (and the DuckDB
  // file lock) alive forever, since later signals were ignored.
  it('forces exit 1 when close hangs past the deadline', async () => {
    const close = vi.fn(() => new Promise<void>(() => {}));
    registerShutdown({ close }, silentLogger, { timeoutMs: 1_000 });
    process.emit('SIGTERM', 'SIGTERM');
    process.emit('SIGTERM', 'SIGTERM');
    await vi.advanceTimersByTimeAsync(999);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
