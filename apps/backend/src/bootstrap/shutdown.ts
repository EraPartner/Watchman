import type { Logger } from 'pino';

interface Closable {
  close(): Promise<unknown>;
}

export interface ShutdownStep {
  name: string;
  run(): Promise<unknown> | unknown;
}

export interface ShutdownOptions {
  /** Force-exit with code 1 if close() has not settled by then. */
  timeoutMs?: number;
}

const ORPHAN_POLL_MS = 5_000;
export const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Run every step in order, even when an earlier one fails, so a failing step
 * never leaves later resources (e.g. the DuckDB file lock) unreleased.
 * Rejects with an AggregateError of all failures after the last step.
 */
export async function runShutdownSteps(
  steps: ReadonlyArray<ShutdownStep>,
  logger: Logger,
): Promise<void> {
  const errors: unknown[] = [];
  for (const step of steps) {
    try {
      await step.run();
    } catch (err) {
      logger.error({ err, step: step.name }, 'shutdown step failed');
      errors.push(err);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, `${errors.length} shutdown step(s) failed`);
  }
}

export function registerShutdown(
  app: Closable,
  logger: Logger,
  opts: ShutdownOptions = {},
): void {
  const timeoutMs = opts.timeoutMs ?? SHUTDOWN_TIMEOUT_MS;
  let shuttingDown = false;

  const trigger = async (reason: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ reason }, 'shutdown requested');
    // A hung close() would otherwise keep the process (and the DuckDB lock)
    // alive forever: later signals and the orphan check are ignored once
    // shuttingDown is set.
    const deadline = setTimeout(() => {
      logger.error({ timeoutMs }, 'shutdown timed out, forcing exit');
      process.exit(1);
    }, timeoutMs);
    deadline.unref();
    try {
      await app.close();
      logger.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'shutdown failed');
      process.exit(1);
    } finally {
      clearTimeout(deadline);
    }
  };

  const signalHandler = (signal: NodeJS.Signals) => {
    void trigger(`signal:${signal}`);
  };

  process.on('SIGINT', signalHandler);
  process.on('SIGTERM', signalHandler);
  process.on('SIGHUP', signalHandler);

  // If the parent severed the IPC channel (node child_process with `ipc`),
  // treat it as an orphan signal and exit cleanly.
  process.on('disconnect', () => {
    void trigger('parent-disconnect');
  });

  // Orphan detection: if we started under a real parent and that parent
  // later dies, the OS reparents us to PID 1. Exit cleanly so we release
  // the DuckDB lock instead of lingering indefinitely.
  const initialPpid = process.ppid;
  if (initialPpid !== 1) {
    const orphanCheck = setInterval(() => {
      if (process.ppid === 1) {
        clearInterval(orphanCheck);
        logger.warn({ initialPpid }, 'parent process exited, shutting down');
        void trigger('orphaned');
      }
    }, ORPHAN_POLL_MS);
    orphanCheck.unref();
  }
}
