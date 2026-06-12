import { pino, type Logger, type LoggerOptions } from "pino";

export type { Logger };

export function createLogger(env: {
  NODE_ENV: "development" | "test" | "production";
  LOG_LEVEL: string;
}): Logger {
  const base: LoggerOptions = {
    level: env.LOG_LEVEL,
    base: { service: "watchman-backend-v2" },
    timestamp: pino.stdTimeFunctions.isoTime,
    // never log credentials/tokens — covers request logging (auth headers,
    // cookies) and ad-hoc object logging of service configs
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'res.headers["set-cookie"]',
        "password",
        "passwd",
        "token",
        "secret",
        "apiKey",
        "authHeader",
        "*.password",
        "*.passwd",
        "*.token",
        "*.secret",
        "*.apiKey",
        "*.authHeader",
        "*.headers.authorization",
        "*.headers.cookie",
      ],
      censor: "[redacted]",
    },
  };

  if (env.NODE_ENV === "development") {
    return pino({
      ...base,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      },
    });
  }

  return pino(base);
}
