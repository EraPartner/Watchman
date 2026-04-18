import type { Logger } from 'pino';

interface Closable {
  close(): Promise<unknown>;
}

export function registerShutdown(app: Closable, logger: Logger): void {
  let shuttingDown = false;

  const handler = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutdown requested');
    try {
      await app.close();
      logger.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);
}
