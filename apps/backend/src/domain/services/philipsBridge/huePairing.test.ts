import { describe, it, expect, vi, type Mock } from 'vitest';
import { pairBridge } from './huePairing.js';
import type { HttpClient, HttpRequest } from '../../../infra/http/client.js';
import { UnavailableError, ValidationError } from '../../../core/errors.js';
import { required } from "../../../test/required.js";

/** A fake client whose send mock tests can read directly. */
type FakeHttp = { send: Mock<HttpClient["send"]> };

const FAKE_CERT_HASH = 'aabbcc112233aabbcc112233aabbcc112233aabbcc112233aabbcc112233aabb';

function fakeProbeCertHash(_host: string, _port: number, _timeoutMs: number): Promise<string> {
  return Promise.resolve(FAKE_CERT_HASH);
}

function fakeHttp(status: number, body: unknown): FakeHttp {
  return {
    send: vi.fn<HttpClient["send"]>((_req: HttpRequest) => Promise.resolve({
      status,
      headers: {},
      text: () => Promise.resolve(JSON.stringify(body)),
      json: <T>() => Promise.resolve(body as T),
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

  it('posts to /api with devicetype only (no unused entertainment client key)', async () => {
    const http = fakeHttp(200, [{ success: { username: 'key' } }]);
    await pairBridge('192.168.1.50', { http, probeCertHash: fakeProbeCertHash });
    const req = required(vi.mocked(http.send).mock.calls[0])[0];
    expect(req.url).toBe('https://192.168.1.50/api');
    expect(req.method).toBe('POST');
    const body = JSON.parse(req.body as string) as { devicetype: string };
    expect(body.devicetype).toBe('watchman#host');
    expect(body).toEqual({ devicetype: 'watchman#host' });
  });

  it('pairs over a client pinned to the probed cert when one is provided', async () => {
    const strict = fakeHttp(200, [{ success: { username: 'unused' } }]);
    const pinned = fakeHttp(200, [{ success: { username: 'pinned-key' } }]);
    const httpForCert = vi.fn(() => pinned);
    const result = await pairBridge('192.168.1.50', {
      http: strict,
      probeCertHash: fakeProbeCertHash,
      httpForCert,
    });
    expect(httpForCert).toHaveBeenCalledWith(FAKE_CERT_HASH);
    expect(strict.send).not.toHaveBeenCalled();
    expect(result).toEqual({ applicationKey: 'pinned-key', certHash: FAKE_CERT_HASH });
  });

  it('throws UnavailableError when the bridge reply is not JSON', async () => {
    const http: HttpClient = {
      send: vi.fn(() => Promise.resolve({
        status: 200,
        headers: {},
        text: () => Promise.resolve('<html>'),
        json: <T>(): Promise<T> => {
          return Promise.reject(new SyntaxError('Unexpected token <'));
        },
      })),
    };
    await expect(
      pairBridge('192.168.1.50', { http, probeCertHash: fakeProbeCertHash }),
    ).rejects.toThrow(UnavailableError);
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
      send: vi.fn(() => { return Promise.reject(new UnavailableError('connection refused')); }),
    };
    await expect(
      pairBridge('192.168.1.50', { http: failHttp, probeCertHash: fakeProbeCertHash }),
    ).rejects.toThrow(UnavailableError);
  });

  it('uses custom timeoutMs when provided', async () => {
    const http = fakeHttp(200, [{ success: { username: 'key' } }]);
    const probeSpy = vi.fn((_h: string, _p: number, _t: number) => Promise.resolve(FAKE_CERT_HASH));
    await pairBridge('192.168.1.50', { http, probeCertHash: probeSpy }, 3_000);
    expect(probeSpy).toHaveBeenCalledWith('192.168.1.50', 443, 3_000);
    const req = required(vi.mocked(http.send).mock.calls[0])[0];
    expect(req.timeoutMs).toBe(3_000);
  });
});
