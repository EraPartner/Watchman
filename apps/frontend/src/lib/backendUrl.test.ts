import { describe, expect, it, vi, afterEach } from "vitest";

describe("getWebSocketUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.doUnmock("./env");
    vi.resetModules();
  });

  it("uses secure wss protocol for https backend URL", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "https://api.example.com");

    const { getWebSocketUrl } = await import("./backendUrl");
    expect(getWebSocketUrl()).toBe("wss://api.example.com/ws");
  });

  it("uses ws protocol for http backend URL", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "http://api.example.com:3001");

    const { getWebSocketUrl } = await import("./backendUrl");
    expect(getWebSocketUrl("events")).toBe("ws://api.example.com:3001/events");
  });

  it("falls back to localhost websocket URL when backend env URL is empty", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "");

    const { getWebSocketUrl } = await import("./backendUrl");
    expect(getWebSocketUrl("events")).toBe("ws://localhost:3001/events");
  });

  it("normalizes websocket path when missing leading slash", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "https://api.example.com");

    const { getWebSocketUrl } = await import("./backendUrl");
    expect(getWebSocketUrl("updates")).toBe("wss://api.example.com/updates");
  });

  it("falls back to runtime window host when backend env URL is invalid", async () => {
    vi.doMock("./env", () => ({
      env: {
        get: () => "not-a-valid-url",
      },
    }));
    vi.stubGlobal("window", {
      location: {
        protocol: "https:",
        host: "watchman.example.com",
      },
    });

    const { getWebSocketUrl } = await import("./backendUrl");
    expect(getWebSocketUrl("events")).toBe("wss://watchman.example.com/events");
  });
});

describe("getBackendUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.doUnmock("./env");
    vi.resetModules();
  });

  it("returns env backend URL when provided", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "https://api.example.com");

    const { getBackendUrl } = await import("./backendUrl");
    expect(getBackendUrl()).toBe("https://api.example.com");
  });

  it("returns empty backend URL in development when env URL is not set", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "");

    const { getBackendUrl } = await import("./backendUrl");
    expect(getBackendUrl()).toBe("");
  });

  it("returns window-derived URL in production when env URL is not set", async () => {
    vi.doMock("./env", () => ({
      env: {
        get: () => "",
      },
    }));
    vi.stubGlobal("window", {
      location: {
        protocol: "https:",
        hostname: "dashboard.example.com",
      },
    });
    vi.stubEnv("DEV", "");

    const { getBackendUrl } = await import("./backendUrl");
    expect(getBackendUrl()).toBe("https://dashboard.example.com:3001");
  });
});
