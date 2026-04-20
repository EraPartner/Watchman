import { describe, expect, it, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function stubBridge(bridge: Record<string, unknown> | undefined) {
  vi.stubGlobal("window", {
    __WATCHMAN__: bridge,
    location: { protocol: "http:", host: "localhost:5173" },
  });
}

describe("getBackendUrl", () => {
  it("returns the desktop bridge apiUrl when present", async () => {
    stubBridge({ apiUrl: "http://192.168.1.10:3001", isDesktop: true });
    const { getBackendUrl } = await import("./backendUrl");
    expect(getBackendUrl()).toBe("http://192.168.1.10:3001");
  });

  it("returns empty string when bridge is missing", async () => {
    stubBridge(undefined);
    const { getBackendUrl } = await import("./backendUrl");
    expect(getBackendUrl()).toBe("");
  });

  it("returns empty string when bridge apiUrl is unset", async () => {
    stubBridge({ isDesktop: true });
    const { getBackendUrl } = await import("./backendUrl");
    expect(getBackendUrl()).toBe("");
  });
});

describe("getWebSocketUrl", () => {
  it("uses bridge wsUrl when present", async () => {
    stubBridge({
      apiUrl: "http://192.168.1.10:3001",
      wsUrl: "ws://192.168.1.10:3001/ws",
      isDesktop: true,
    });
    const { getWebSocketUrl } = await import("./backendUrl");
    expect(getWebSocketUrl()).toBe("ws://192.168.1.10:3001/ws");
  });

  it("normalizes missing leading slash in path", async () => {
    stubBridge({
      wsUrl: "ws://192.168.1.10:3001/ws",
      isDesktop: true,
    });
    const { getWebSocketUrl } = await import("./backendUrl");
    expect(getWebSocketUrl("events")).toBe("ws://192.168.1.10:3001/events");
  });

  it("falls back to window host when bridge wsUrl is missing", async () => {
    vi.stubGlobal("window", {
      __WATCHMAN__: undefined,
      location: { protocol: "http:", host: "localhost:5173" },
    });
    const { getWebSocketUrl } = await import("./backendUrl");
    expect(getWebSocketUrl()).toBe("ws://localhost:5173/ws");
  });

  it("uses wss when window protocol is https", async () => {
    vi.stubGlobal("window", {
      __WATCHMAN__: undefined,
      location: { protocol: "https:", host: "dashboard.example.com" },
    });
    const { getWebSocketUrl } = await import("./backendUrl");
    expect(getWebSocketUrl()).toBe("wss://dashboard.example.com/ws");
  });
});
