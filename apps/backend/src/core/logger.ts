import { pino, type Logger, type LoggerOptions } from 'pino';

export type { Logger };

export function createLogger(env: {
  NODE_ENV: 'development' | 'test' | 'production';
  LOG_LEVEL: string;
}): Logger {
  const base: LoggerOptions = {
    level: env.LOG_LEVEL,
    base: { service: 'watchman-backend-v2' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (env.NODE_ENV === 'development') {
    return pino({
      ...base,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
      },
    });
  }

  return pino(base);
}
