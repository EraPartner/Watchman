import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createJwtClient } from './jwtClient.js';
import type { HttpClient, HttpRequest, HttpResponse } from './client.js';
import { required } from "../../test/required.js";

/** A fake client whose send mock tests can read directly. */
type FakeHttp = { send: Mock<HttpClient["send"]> };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fakeResponse(status: number, body?: unknown): HttpResponse {
  return {
    status,
    headers: {},
    text: () => Promise.resolve(JSON.stringify(body ?? {})),
    json: <T>() => Promise.resolve((body ?? {}) as T),
  };
}

/** Returns an HttpClient that replays `responses` in order, then throws. */
function sequentialHttp(responses: HttpResponse[]): FakeHttp {
  let index = 0;
  return {
    send: vi.fn<HttpClient["send"]>((_req: HttpRequest): Promise<HttpResponse> => {
      const r = responses[index++];
      if (!r) return Promise.reject(new Error(`unexpected extra send (call ${index})`));
      return Promise.resolve(r);
    }),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createJwtClient', () => {
  it('injects Bearer token into request headers', async () => {
    const inner = sequentialHttp([fakeResponse(200)]);
    const client = createJwtClient(inner, {
      initialToken: 'initial-token',
      refresh: vi.fn(() => Promise.resolve('new-token')),
    });

    await client.send({ url: 'http://example.com/api', method: 'GET' });

    const req = required(vi.mocked(inner.send).mock.calls[0])[0];
    expect(req.headers?.['authorization']).toBe('Bearer initial-token');
  });

  it('passes through non-401 responses without refresh', async () => {
    const refresh = vi.fn(() => Promise.resolve('new-token'));
    const inner = sequentialHttp([fakeResponse(200)]);
    const client = createJwtClient(inner, { initialToken: 'tok', refresh });

    const res = await client.send({ url: 'http://example.com', method: 'GET' });
    expect(res.status).toBe(200);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('calls refresh once on 401 and retries with new token', async () => {
    const refresh = vi.fn(() => Promise.resolve('refreshed-token'));
    const inner = sequentialHttp([fakeResponse(401), fakeResponse(200, { ok: true })]);
    const client = createJwtClient(inner, { initialToken: 'stale', refresh });

    const res = await client.send({ url: 'http://example.com/data', method: 'GET' });
    expect(res.status).toBe(200);
    expect(refresh).toHaveBeenCalledTimes(1);

    const [firstReq, secondReq] = vi.mocked(inner.send).mock.calls;
    expect(required(firstReq)[0].headers?.['authorization']).toBe('Bearer stale');
    expect(required(secondReq)[0].headers?.['authorization']).toBe('Bearer refreshed-token');
  });

  it('consumes the discarded 401 body before retrying', async () => {
    const first = fakeResponse(401);
    const text = vi.fn(() => Promise.resolve(''));
    first.text = text;
    const http = sequentialHttp([first, fakeResponse(200)]);
    const client = createJwtClient(http, { refresh: () => Promise.resolve('tok') });
    const res = await client.send({ url: 'http://x/api' });
    expect(res.status).toBe(200);
    expect(text).toHaveBeenCalledTimes(1);
  });

  it('does not refresh again after retry — only one attempt per 401', async () => {
    const refresh = vi.fn(() => Promise.resolve('refreshed-token'));
    // Both 401 and 401 means the retry also fails — no second refresh
    const inner = sequentialHttp([fakeResponse(401), fakeResponse(401)]);
    const client = createJwtClient(inner, { initialToken: 'stale', refresh });

    const res = await client.send({ url: 'http://example.com', method: 'GET' });
    expect(res.status).toBe(401);           // second 401 returned as-is
    expect(refresh).toHaveBeenCalledTimes(1); // no second refresh
    expect(vi.mocked(inner.send)).toHaveBeenCalledTimes(2);
  });

  it('no thundering herd — concurrent 401s share one refresh call', async () => {
    let resolveRefresh!: (token: string) => void;
    const refreshPromise = new Promise<string>((res) => { resolveRefresh = res; });
    const refresh = vi.fn(() => refreshPromise);

    // 3 concurrent requests each get 401, then 200
    const inner: HttpClient = {
      send: vi.fn((req: HttpRequest) => {
        if (req.headers?.['authorization'] === 'Bearer stale') return Promise.resolve(fakeResponse(401));
        return Promise.resolve(fakeResponse(200, { ok: true }));
      }),
    };

    const client = createJwtClient(inner, { initialToken: 'stale', refresh });

    // Launch 3 concurrent requests
    const [r1, r2, r3] = await Promise.all([
      (async () => { const p = client.send({ url: 'http://x.com/1', method: 'GET' }); resolveRefresh('fresh-token'); return p; })(),
      client.send({ url: 'http://x.com/2', method: 'GET' }),
      client.send({ url: 'http://x.com/3', method: 'GET' }),
    ]);

    expect(required(r1).status).toBe(200);
    expect(required(r2).status).toBe(200);
    expect(required(r3).status).toBe(200);
    // Only ONE refresh call despite three concurrent 401s
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refresh failure propagates to all waiters', async () => {
    const refresh = vi.fn(() => { return Promise.reject(new Error('auth server down')); });
    const inner = sequentialHttp([fakeResponse(401)]);
    const client = createJwtClient(inner, { initialToken: 'stale', refresh });

    await expect(client.send({ url: 'http://example.com', method: 'GET' })).rejects.toThrow(
      'auth server down',
    );
  });

  it('uses new token for subsequent requests after successful refresh', async () => {
    const refresh = vi.fn(() => Promise.resolve('new-token'));
    const inner = sequentialHttp([
      fakeResponse(401),    // first request → 401
      fakeResponse(200),    // retry with new-token → 200
      fakeResponse(200),    // second independent request → 200
    ]);
    const client = createJwtClient(inner, { initialToken: 'old', refresh });

    await client.send({ url: 'http://example.com/a', method: 'GET' });
    await client.send({ url: 'http://example.com/b', method: 'GET' });

    const calls = vi.mocked(inner.send).mock.calls;
    expect(required(calls[2])[0].headers?.['authorization']).toBe('Bearer new-token');
  });

  it('refresh returning empty string — no authorization header injected on retry', async () => {
    const refresh = vi.fn(() => Promise.resolve(''));
    const inner = sequentialHttp([fakeResponse(401), fakeResponse(200)]);
    const client = createJwtClient(inner, { initialToken: 'stale', refresh });

    await client.send({ url: 'http://example.com', method: 'GET' });
    const retryReq = required(vi.mocked(inner.send).mock.calls[1])[0];
    // Empty token → no Bearer header on retry
    expect(retryReq.headers?.['authorization']).toBeUndefined();
  });

  it('works with no initial token — skips authorization header until refreshed', async () => {
    const refresh = vi.fn(() => Promise.resolve('first-token'));
    const inner = sequentialHttp([fakeResponse(401), fakeResponse(200)]);
    const client = createJwtClient(inner, { refresh });

    await client.send({ url: 'http://example.com', method: 'GET' });
    const firstReq = required(vi.mocked(inner.send).mock.calls[0])[0];
    // No initial token → no authorization header on first attempt
    expect(firstReq.headers?.['authorization']).toBeUndefined();
    // After refresh, retry should have the token
    const retryReq = required(vi.mocked(inner.send).mock.calls[1])[0];
    expect(retryReq.headers?.['authorization']).toBe('Bearer first-token');
  });
});
