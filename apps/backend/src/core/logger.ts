import {
  pino,
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from "pino";

export type { Logger };

// Generic credential names plus every service secret field (KIND_META
// secretFields; logger.test.ts keeps the two in sync). Redacted at the top level
// and one level down, e.g. logger.info({ config }) of a service config.
export const REDACTED_LOG_KEYS = [
  "password",
  "passwd",
  "token",
  "secret",
  "apiKey",
  "authHeader",
  "authToken",
  "rpcPassword",
  "controlPassword",
  "dsmPassword",
  "applicationKey",
  "snmpCommunity",
  "snmpAuthKey",
  "snmpPrivKey",
  "sshPassphrase",
  "macMiniSshPassphrase",
];

export function createLogger(
  env: {
    NODE_ENV: "development" | "test" | "production";
    LOG_LEVEL: string;
  },
  /** Non-development output target; defaults to stdout. Used by tests. */
  destination?: DestinationStream
): Logger {
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
        ...REDACTED_LOG_KEYS,
        ...REDACTED_LOG_KEYS.map((k) => `*.${k}`),
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

  return destination ? pino(base, destination) : pino(base);
}
