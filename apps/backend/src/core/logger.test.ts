import { describe, it, expect } from "vitest";
import { KIND_META, SERVICE_KINDS } from "../config/schemas/index.js";
import { REDACTED_LOG_KEYS, createLogger } from "./logger.js";

function capture(): { lines: string[]; write(msg: string): void } {
  const lines: string[] = [];
  return { lines, write: (msg: string) => void lines.push(msg) };
}

describe("logger redaction", () => {
  it("covers every service secret field", () => {
    // Regression: redaction listed only generic names (password, token, ...),
    // so fields like rpcPassword or sshPassphrase were logged in clear.
    const secretFields = SERVICE_KINDS.flatMap(
      (k) => KIND_META[k].secretFields
    );
    for (const field of secretFields) {
      expect(REDACTED_LOG_KEYS).toContain(field);
    }
  });

  it("censors secret fields at the top level and one level down", () => {
    const dest = capture();
    const logger = createLogger(
      { NODE_ENV: "production", LOG_LEVEL: "info" },
      dest
    );
    logger.info(
      {
        rpcPassword: "top-secret",
        config: { sshPassphrase: "nested-secret", host: "pi.local" },
      },
      "svc"
    );
    expect(dest.lines).toHaveLength(1);
    const line = JSON.parse(dest.lines[0]!) as {
      rpcPassword: string;
      config: { sshPassphrase: string; host: string };
    };
    expect(line.rpcPassword).toBe("[redacted]");
    expect(line.config.sshPassphrase).toBe("[redacted]");
    expect(line.config.host).toBe("pi.local");
    expect(dest.lines[0]).not.toContain("secret");
  });
});
