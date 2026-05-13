import type { Logger } from 'pino';

interface Closable {
  close(): Promise<unknown>;
}

const ORPHAN_POLL_MS = 5_000;

export function registerShutdown(app: Closable, logger: Logger): void {
  let shuttingDown = false;

  const trigger = async (reason: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ reason }, 'shutdown requested');
    try {
      await app.close();
      logger.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'shutdown failed');
      process.exit(1);
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
