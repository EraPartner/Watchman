type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private isDevelopment = import.meta.env.MODE === 'development';

  private formatMessage(level: LogLevel, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const prefix = this.getLogPrefix(level);
    return data ? `${prefix} [${timestamp}] ${message}` : `${prefix} [${timestamp}] ${message}`;
  }

  private getLogPrefix(level: LogLevel): string {
    switch (level) {
      case 'debug': return '🔍';
      case 'info': return 'ℹ️';
      case 'warn': return '⚠️';
      case 'error': return '❌';
      default: return '';
    }
  }

  debug(message: string, data?: unknown): void {
    if (this.isDevelopment) {
      console.debug(this.formatMessage('debug', message, data), data ? data : '');
    }
  }

  info(message: string, data?: unknown): void {
    console.info(this.formatMessage('info', message, data), data ? data : '');
  }

  warn(message: string, data?: unknown): void {
    console.warn(this.formatMessage('warn', message, data), data ? data : '');
  }

  error(message: string, data?: unknown): void {
    console.error(this.formatMessage('error', message, data), data ? data : '');
  }

  // Service-specific logging helpers
  serviceCreated(id: string): void {
    this.info(`Service created successfully: ${id}`);
  }

  serviceCreationFailed(id: string, type: string, error: unknown): void {
    this.error(`Service creation failed: ${id} (type: ${type})`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
  }

  serviceNotFound(id: string): void {
    this.warn(`Service not found: ${id}`);
  }
}

export const logger = new Logger();