import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientCore } from "./core";

describe("ApiClientCore", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("dedupes in-flight requests for same key", async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });

    const fetchSpy = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal("fetch", fetchSpy);

    const client = new ApiClientCore();

    const p1 = client.request<{ value: number }>("/api/dedupe");
    const p2 = client.request<{ value: number }>("/api/dedupe");

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    resolveFetch({
      ok: true,
      json: async () => ({ success: true, data: { value: 42 }, error: null }),
    });

    await expect(p1).resolves.toEqual({ value: 42 });
    await expect(p2).resolves.toEqual({ value: 42 });
  });

  it("retries retryable status for GET but not POST", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const client = new ApiClientCore();
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: async () => ({ error: "busy" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: async () => ({ error: "busy" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { ok: true }, error: null }),
      });
    vi.stubGlobal("fetch", fetchSpy);

    const getPromise = client.request<{ ok: boolean }>("/api/retry-get");
    await vi.advanceTimersByTimeAsync(600);
    await vi.advanceTimersByTimeAsync(1100);
    await expect(getPromise).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: async () => ({ error: "busy" }),
    });

    const postPromise = client.request("/api/retry-post", {
      method: "POST",
      body: JSON.stringify({ x: 1 }),
    });

    await expect(postPromise).rejects.toThrow("busy");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("auto-sets content-type for non-GET/HEAD when absent", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { ok: true }, error: null }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const client = new ApiClientCore();
    await client.request("/api/post", {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
      headers: {},
    });

    const options = fetchSpy.mock.calls[0][1] as Record<string, unknown>;
    const headers = options.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("uses fallback auth token when Authorization header is absent", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { ok: true }, error: null }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const client = new ApiClientCore();
    client.setFallbackAuthToken("fallback-token");

    await client.request("/api/auth-check");

    const firstHeaders = fetchSpy.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(firstHeaders.Authorization).toBe("Bearer fallback-token");

    await client.request("/api/auth-check-2", {
      headers: { Authorization: "Bearer explicit" },
    });

    const secondHeaders = fetchSpy.mock.calls[1][1].headers as Record<
      string,
      string
    >;
    expect(secondHeaders.Authorization).toBe("Bearer explicit");
  });

  it("transforms AbortError into timeout message", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    const client = new ApiClientCore();
    await expect(
      client.request("/api/slow", { method: "POST" }, 250)
    ).rejects.toMatchObject({
      name: "AbortError",
      message: "Network error: request to /api/slow timed out after 250ms",
    });
  });

  it("transforms fetch TypeError into backend connectivity message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    );

    const client = new ApiClientCore();
    await expect(
      client.request("/api/network", { method: "POST" })
    ).rejects.toThrow(
      /Network error: Cannot connect to backend at .*Please check if the backend is running\./
    );
  });

  it("unwraps successful API responses and surfaces extractApiError failures", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { ignored: true },
          _payload: { selected: "payload" },
          error: null,
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ error: "invalid-input" }),
      });
    vi.stubGlobal("fetch", fetchSpy);

    const client = new ApiClientCore();
    await expect(client.request("/api/success")).resolves.toEqual({
      selected: "payload",
    });

    await expect(
      client.request("/api/failure", { method: "POST" })
    ).rejects.toMatchObject({
      message: "invalid-input",
      status: 400,
    });
  });
});
