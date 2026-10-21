type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: unknown;
  error?: string;
  stack?: string;
}

class Logger {
  private isDevelopment = import.meta.env.MODE === "development";
  private enabled = import.meta.env.VITE_LOG_ENABLED !== "false";

  private format(level: LogLevel, message: string, data?: unknown): string {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message: this.redact(message),
    };

    if (data) {
      if (data instanceof Error) {
        logEntry.error = data.message;
        if (data.stack) {
          logEntry.stack = data.stack;
        }
      } else if (typeof data === "object" && data !== null) {
        // Data keys must not overwrite the entry's own timestamp/level/message;
        // keep the full payload under `data` when they collide.
        const collides = ["timestamp", "level", "message"].some(
          (key) => key in data
        );
        Object.assign(logEntry, data, {
          timestamp: logEntry.timestamp,
          level: logEntry.level,
          message: logEntry.message,
        });
        if (collides) logEntry.data = data;
      } else {
        logEntry.data = data;
      }
    }

    return JSON.stringify(logEntry);
  }

  private redact(message: string): string {
    let redacted = String(message);
    const redactPatterns = [
      /password[=:]\s*["']?([^"'\s]+)["']?/gi,
      /token[=:]\s*["']?([^"'\s]+)["']?/gi,
      /secret[=:]\s*["']?([^"'\s]+)["']?/gi,
      /authorization:\s*["']?([^"'\s]+)["']?/gi,
      /Bearer\s+([A-Za-z0-9\-._~+/]+=*)/gi,
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
    ];

    redactPatterns.forEach((pattern) => {
      redacted = redacted.replace(pattern, (match, group) => {
        if (typeof group !== "string" || group.length === 0) {
          return "[REDACTED]";
        }
        // The captured value sits at the end of the match; replacing its first
        // occurrence would hit the key instead when the value is a substring of
        // it (e.g. "password=pass") and leak the value.
        const at = match.lastIndexOf(group);
        return `${match.slice(0, at)}[REDACTED]${match.slice(at + group.length)}`;
      });
    });

    return redacted;
  }

  debug(message: string, data?: unknown): void {
    if (!this.enabled) return;
    if (this.isDevelopment) {
      console.log(this.format("debug", message, data));
    }
  }

  info(message: string, data?: unknown): void {
    if (!this.enabled) return;
    console.log(this.format("info", message, data));
  }

  warn(message: string, data?: unknown): void {
    if (!this.enabled) return;
    console.log(this.format("warn", message, data));
  }

  error(message: string, data?: unknown): void {
    if (!this.enabled) return;
    console.log(this.format("error", message, data));
  }

  // Service-specific logging helpers
  serviceCreated(id: string): void {
    this.info(`[SUCCESS] Service created successfully: ${id}`);
  }

  serviceCreationFailed(id: string, type: string, error: unknown): void {
    this.error(`[ERROR] Service creation failed: ${id} (type: ${type})`, {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  serviceNotFound(id: string): void {
    this.warn(`[WARNING] Service not found: ${id}`);
  }

  // WebSocket specific logging helpers
  websocket(message: string, data?: unknown): void {
    this.info(`[WEBSOCKET] ${message}`, data);
  }

  // Service worker logging helpers
  serviceWorker(message: string, data?: unknown): void {
    this.info(`[SERVICE_WORKER] ${message}`, data);
  }
}

export const logger = new Logger();
