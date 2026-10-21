// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("redacts password, token, secret and email from message", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { logger } = await import("./logger");

    logger.info(
      "password=abc token=xyz secret=shhh authorization:Bearer test a@b.com"
    );

    const [payload] = logSpy.mock.calls[0] as [string];
    expect(payload).toContain("[REDACTED]");
    expect(payload).not.toContain("abc");
    expect(payload).not.toContain("xyz");
    expect(payload).not.toContain("shhh");
    expect(payload).not.toContain("a@b.com");
  });

  it("does not leak a value that is a substring of its key", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { logger } = await import("./logger");

    logger.info("login password=pass token=t");

    const [payload] = logSpy.mock.calls[0] as [string];
    const { message } = JSON.parse(payload) as { message: string };
    expect(message).toBe("login password=[REDACTED] token=[REDACTED]");
  });

  it("keeps its own level and message when data has the same keys", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { logger } = await import("./logger");

    logger.warn("[WEBSOCKET] Alert message received", {
      level: "error",
      message: "disk full",
    });

    const [payload] = logSpy.mock.calls[0] as [string];
    const parsed = JSON.parse(payload) as {
      level: string;
      message: string;
      data?: { level: string; message: string };
    };
    expect(parsed.level).toBe("WARN");
    expect(parsed.message).toBe("[WEBSOCKET] Alert message received");
    expect(parsed.data).toEqual({ level: "error", message: "disk full" });
  });

  it("serializes Error data with message and stack", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { logger } = await import("./logger");

    logger.error("request failed", new Error("boom"));

    const [payload] = logSpy.mock.calls[0] as [string];
    const parsed = JSON.parse(payload) as {
      level: string;
      message: string;
      error?: string;
      stack?: string;
    };

    expect(parsed.level).toBe("ERROR");
    expect(parsed.message).toBe("request failed");
    expect(parsed.error).toBe("boom");
    expect(typeof parsed.stack).toBe("string");
  });

  it("merges object data into structured log payload", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { logger } = await import("./logger");

    logger.warn("service warning", { serviceId: "alpha", status: "degraded" });

    const [payload] = logSpy.mock.calls[0] as [string];
    const parsed = JSON.parse(payload) as {
      level: string;
      message: string;
      serviceId?: string;
      status?: string;
    };

    expect(parsed.level).toBe("WARN");
    expect(parsed.message).toBe("service warning");
    expect(parsed.serviceId).toBe("alpha");
    expect(parsed.status).toBe("degraded");
  });

  it("serviceCreated logs success helper message", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { logger } = await import("./logger");

    logger.serviceCreated("service-1");

    const [payload] = logSpy.mock.calls[0] as [string];
    const parsed = JSON.parse(payload) as { message: string };
    expect(parsed.message).toContain(
      "[SUCCESS] Service created successfully: service-1"
    );
  });

  it("websocket helper prefixes message", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { logger } = await import("./logger");

    logger.websocket("connected", { attempts: 1 });

    const [payload] = logSpy.mock.calls[0] as [string];
    const parsed = JSON.parse(payload) as {
      message: string;
      attempts?: number;
    };
    expect(parsed.message).toBe("[WEBSOCKET] connected");
    expect(parsed.attempts).toBe(1);
  });

  it("serviceWorker helper prefixes message", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { logger } = await import("./logger");

    logger.serviceWorker("registered");

    const [payload] = logSpy.mock.calls[0] as [string];
    const parsed = JSON.parse(payload) as { message: string };
    expect(parsed.message).toBe("[SERVICE_WORKER] registered");
  });

  it("debug logging is gated outside development mode", async () => {
    vi.stubEnv("MODE", "production");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { logger } = await import("./logger");

    logger.debug("hidden debug");

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("redacts bearer token value without exposing token", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { logger } = await import("./logger");

    logger.info("Authorization: Bearer");

    const [payload] = logSpy.mock.calls[0] as [string];
    const parsed = JSON.parse(payload) as { message: string };
    expect(parsed.message).toBe("Authorization: [REDACTED]");
  });

  it("serializes primitive data values under data field", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { logger } = await import("./logger");

    logger.info("count", 42);

    const [payload] = logSpy.mock.calls[0] as [string];
    const parsed = JSON.parse(payload) as { data?: number; level: string };
    expect(parsed.level).toBe("INFO");
    expect(parsed.data).toBe(42);
  });

  it("serviceCreationFailed logs unknown error payload for non-Error", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { logger } = await import("./logger");

    logger.serviceCreationFailed("svc-1", "tor", "bad payload");

    const [payload] = logSpy.mock.calls[0] as [string];
    const parsed = JSON.parse(payload) as {
      level: string;
      message: string;
      error?: string;
      stack?: string;
    };

    expect(parsed.level).toBe("ERROR");
    expect(parsed.message).toContain("Service creation failed: svc-1");
    expect(parsed.error).toBe("Unknown error");
    expect(parsed.stack).toBeUndefined();
  });
});
