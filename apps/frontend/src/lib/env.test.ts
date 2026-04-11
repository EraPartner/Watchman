import { afterEach, describe, expect, it, vi } from "vitest";

describe("env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("accepts empty backend URL and throws on getRequired", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "");
    const { env } = await import("./env");

    expect(env.get("VITE_BACKEND_URL")).toBe("");
    expect(() => env.getRequired("VITE_BACKEND_URL")).toThrow(
      "Environment variable VITE_BACKEND_URL is required but not set"
    );
  });

  it("returns validated backend URL and optional frontend port", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "https://api.example.com");
    vi.stubEnv("VITE_FRONTEND_PORT", "5173");
    const { env } = await import("./env");

    expect(env.getRequired("VITE_BACKEND_URL")).toBe("https://api.example.com");
    expect(env.get("VITE_FRONTEND_PORT")).toBe("5173");
  });

  it("throws when VITE_BACKEND_URL is invalid", async () => {
    vi.stubEnv("VITE_BACKEND_URL", "not-a-url");

    await expect(import("./env")).rejects.toThrow(
      "VITE_BACKEND_URL must be a valid URL when provided"
    );
  });
});
