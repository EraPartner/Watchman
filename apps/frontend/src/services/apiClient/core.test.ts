import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientCore } from "./core";

// ─── Fetch mock helpers ─────────────────────────────────────────────────────

type MockResponseInit = {
  status?: number;
  statusText?: string;
  contentType?: string | null;
  json?: unknown;
  jsonThrows?: boolean;
};

function mockResponse(init: MockResponseInit = {}): Response {
  const status = init.status ?? 200;
  const contentType =
    init.contentType === undefined ? "application/json" : init.contentType;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? "",
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? contentType : null,
    },
    json: async () => {
      if (init.jsonThrows) throw new SyntaxError("Unexpected token");
      return init.json ?? {};
    },
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("ApiClientCore.request", () => {
  it("returns unwrapped data from a v1 success envelope", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ json: { success: true, data: { foo: 1 }, error: null } })
    );
    const core = new ApiClientCore();
    await expect(core.request("/x")).resolves.toEqual({ foo: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/x");
    expect((opts as RequestInit).method).toBe("GET");
  });

  it("returns a plain object body unchanged when not an envelope", async () => {
    fetchMock.mockResolvedValue(mockResponse({ json: { a: 1, b: 2 } }));
    const core = new ApiClientCore();
    await expect(core.request("/plain")).resolves.toEqual({ a: 1, b: 2 });
  });

  it("unwraps a single-key { data } v2 envelope", async () => {
    fetchMock.mockResolvedValue(mockResponse({ json: { data: [1, 2, 3] } }));
    const core = new ApiClientCore();
    await expect(core.request("/list")).resolves.toEqual([1, 2, 3]);
  });

  it("throws an Error carrying the HTTP status on a non-ok response", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({
        status: 400,
        statusText: "Bad Request",
        json: { success: false, data: null, error: "VALIDATION: bad" },
      })
    );
    const core = new ApiClientCore();
    await expect(core.request("/bad")).rejects.toMatchObject({
      message: "VALIDATION: bad",
      status: 400,
    });
  });

  it("throws when the response is not JSON", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ status: 200, contentType: "text/html", json: {} })
    );
    const core = new ApiClientCore();
    await expect(core.request("/html")).rejects.toThrow(
      /Unexpected non-JSON response/
    );
  });

  it("throws when the body claims JSON but fails to parse", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ contentType: "application/json", jsonThrows: true })
    );
    const core = new ApiClientCore();
    await expect(core.request("/broken")).rejects.toThrow(
      /Unexpected non-JSON response/
    );
  });

  it("treats a 204 No Content response as an empty result", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ status: 204, contentType: null })
    );
    const core = new ApiClientCore();
    await expect(core.request("/none")).resolves.toEqual({});
  });

  it("auto-injects Content-Type for a body-bearing POST", async () => {
    fetchMock.mockResolvedValue(mockResponse({ json: { data: { ok: true } } }));
    const core = new ApiClientCore();
    await core.request("/create", { method: "POST", body: '{"a":1}' });
    const opts = fetchMock.mock.calls[0][1] as RequestInit;
    expect((opts.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
  });

  it("does not override an explicit Content-Type header", async () => {
    fetchMock.mockResolvedValue(mockResponse({ json: { data: {} } }));
    const core = new ApiClientCore();
    await core.request("/create", {
      method: "POST",
      body: "x=1",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit)
      .headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("normalizes a Headers instance", async () => {
    fetchMock.mockResolvedValue(mockResponse({ json: { data: {} } }));
    const core = new ApiClientCore();
    const h = new Headers();
    h.set("X-Token", "abc");
    await core.request("/h", { headers: h });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit)
      .headers as Record<string, string>;
    expect(headers["x-token"]).toBe("abc");
  });

  it("normalizes an array-of-tuples headers value", async () => {
    fetchMock.mockResolvedValue(mockResponse({ json: { data: {} } }));
    const core = new ApiClientCore();
    await core.request("/h", {
      headers: [
        ["X-A", "1"],
        ["X-B", "2"],
      ],
    });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit)
      .headers as Record<string, string>;
    expect(headers["X-A"]).toBe("1");
    expect(headers["X-B"]).toBe("2");
  });

  it("deduplicates concurrent identical requests into a single fetch", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );
    const core = new ApiClientCore();
    const p1 = core.request("/dedup");
    const p2 = core.request("/dedup");
    resolveFetch(mockResponse({ json: { data: { v: 1 } } }));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ v: 1 });
    expect(r2).toEqual({ v: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("wraps a fetch TypeError as a connection error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const core = new ApiClientCore();
    // POST is not retried, so the mapped network error surfaces immediately.
    await expect(
      core.request("/x", { method: "POST", body: "{}" })
    ).rejects.toThrow(/Cannot connect to backend/);
  });

  it("maps a timeout/abort into a named AbortError", async () => {
    const abort = new Error("aborted");
    abort.name = "TimeoutError";
    fetchMock.mockRejectedValue(abort);
    const core = new ApiClientCore();
    await expect(
      core.request("/x", { method: "POST", body: "{}" })
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("retries a retryable GET failure and then succeeds", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        mockResponse({ status: 503, statusText: "Unavailable", json: {} })
      )
      .mockResolvedValueOnce(mockResponse({ json: { data: { ok: true } } }));
    const core = new ApiClientCore();
    const p = core.request("/retry");
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-idempotent POST", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ status: 500, statusText: "Server Error", json: {} })
    );
    const core = new ApiClientCore();
    await expect(
      core.request("/x", { method: "POST", body: "{}" })
    ).rejects.toMatchObject({ status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting retries", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(
      mockResponse({ status: 500, statusText: "Server Error", json: {} })
    );
    const core = new ApiClientCore();
    const p = core.request("/always500");
    const assertion = expect(p).rejects.toMatchObject({ status: 500 });
    await vi.runAllTimersAsync();
    await assertion;
    // attempt 0 + 3 retries = 4 fetch calls
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
