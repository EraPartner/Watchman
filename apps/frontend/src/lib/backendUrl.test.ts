import { describe, expect, it, vi, afterEach } from "vitest";

describe("getWebSocketUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses secure wss protocol for https backend URL", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "https://api.example.com");

    const { getWebSocketUrl } = await import("./backendUrl");
    expect(getWebSocketUrl()).toBe("wss://api.example.com/ws");
  });
});
