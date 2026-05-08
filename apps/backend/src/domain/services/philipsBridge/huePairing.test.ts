import { describe, it, expect, vi } from 'vitest';
import { pairBridge } from './huePairing.js';
import type { HttpClient, HttpRequest } from '../../../infra/http/client.js';
import { UnavailableError, ValidationError } from '../../../core/errors.js';

const FAKE_CERT_HASH = 'aabbcc112233aabbcc112233aabbcc112233aabbcc112233aabbcc112233aabb';

function fakeProbeCertHash(_host: string, _port: number, _timeoutMs: number): Promise<string> {
  return Promise.resolve(FAKE_CERT_HASH);
}

function fakeHttp(status: number, body: unknown): HttpClient {
  return {
    send: vi.fn(async (_req: HttpRequest) => ({
      status,
      headers: {},
      text: async () => JSON.stringify(body),
      json: async <T>() => body as T,
    })),
  };
}

// ─── pairBridge ──────────────────────────────────────────────────────────────

describe('pairBridge', () => {
  it('returns applicationKey and certHash on success', async () => {
    const body = [{ success: { username: 'my-app-key-abc', clientkey: 'ckey' } }];
    const result = await pairBridge('192.168.1.50', {
      http: fakeHttp(200, body),
      probeCertHash: fakeProbeCertHash,
    });
    expect(result.applicationKey).toBe('my-app-key-abc');
    expect(result.certHash).toBe(FAKE_CERT_HASH);
  });

  it('posts to /api with devicetype and generateclientkey', async () => {
    const http = fakeHttp(200, [{ success: { username: 'key' } }]);
    await pairBridge('192.168.1.50', { http, probeCertHash: fakeProbeCertHash });
    const req = vi.mocked(http.send).mock.calls[0]![0];
    expect(req.url).toBe('https://192.168.1.50/api');
    expect(req.method).toBe('POST');
    const body = JSON.parse(req.body as string);
    expect(body.devicetype).toBe('watchman#host');
    expect(body.generateclientkey).toBe(true);
  });

  it('throws ValidationError when link button not pressed (error type 101)', async () => {
    const body = [{ error: { type: 101, description: 'link button not pressed' } }];
    await expect(
      pairBridge('192.168.1.50', { http: fakeHttp(200, body), probeCertHash: fakeProbeCertHash }),
    ).rejects.toThrow(ValidationError);
  });

  it('ValidationError message mentions pressing the button', async () => {
    const body = [{ error: { type: 101, description: 'link button not pressed' } }];
    await expect(
      pairBridge('192.168.1.50', { http: fakeHttp(200, body), probeCertHash: fakeProbeCertHash }),
    ).rejects.toThrow(/button/i);
  });

  it('throws UnavailableError for other bridge errors', async () => {
    const body = [{ error: { type: 7, description: 'unauthorized' } }];
    await expect(
      pairBridge('192.168.1.50', { http: fakeHttp(200, body), probeCertHash: fakeProbeCertHash }),
    ).rejects.toThrow(UnavailableError);
  });

  it('throws UnavailableError on unexpected response format', async () => {
    await expect(
      pairBridge('192.168.1.50', {
        http: fakeHttp(200, { not: 'an array' }),
        probeCertHash: fakeProbeCertHash,
      }),
    ).rejects.toThrow(UnavailableError);
  });

  it('throws UnavailableError on empty response array', async () => {
    await expect(
      pairBridge('192.168.1.50', {
        http: fakeHttp(200, []),
        probeCertHash: fakeProbeCertHash,
      }),
    ).rejects.toThrow(UnavailableError);
  });

  it('propagates cert probe error', async () => {
    const failProbe = () => Promise.reject(new UnavailableError('tls probe failed'));
    await expect(
      pairBridge('192.168.1.50', {
        http: fakeHttp(200, [{ success: { username: 'key' } }]),
        probeCertHash: failProbe,
      }),
    ).rejects.toThrow(UnavailableError);
  });

  it('propagates http error', async () => {
    const failHttp: HttpClient = {
      send: vi.fn(async () => { throw new UnavailableError('connection refused'); }),
    };
    await expect(
      pairBridge('192.168.1.50', { http: failHttp, probeCertHash: fakeProbeCertHash }),
    ).rejects.toThrow(UnavailableError);
  });

  it('uses custom timeoutMs when provided', async () => {
    const http = fakeHttp(200, [{ success: { username: 'key' } }]);
    const probeSpy = vi.fn(async (_h: string, _p: number, _t: number) => FAKE_CERT_HASH);
    await pairBridge('192.168.1.50', { http, probeCertHash: probeSpy }, 3_000);
    expect(probeSpy).toHaveBeenCalledWith('192.168.1.50', 443, 3_000);
    const req = vi.mocked(http.send).mock.calls[0]![0];
    expect(req.timeoutMs).toBe(3_000);
  });
});
