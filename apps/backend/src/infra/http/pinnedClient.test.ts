import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { UnauthorizedError } from '../../core/errors.js';
import type { HttpClient, HttpRequest, HttpResponse } from './client.js';

// ─── Fake TLS module ──────────────────────────────────────────────────────────

interface FakeTlsSocket extends EventEmitter {
  getPeerCertificate(): { raw?: Buffer };
  destroy(): void;
}

interface FakeTlsMod {
  _nextCert: Buffer | null;
  _nextError: Error | null;
  connect: ReturnType<typeof vi.fn>;
}

vi.mock('node:tls', () => {
  const state: FakeTlsMod = {
    _nextCert: null,
    _nextError: null,
    connect: vi.fn((_opts: unknown) => {
      const sock = new EventEmitter() as FakeTlsSocket;
      const raw = state._nextCert;
      const err = state._nextError;
      sock.getPeerCertificate = () => (raw ? { raw } : {});
      sock.destroy = vi.fn();
      setImmediate(() => {
        if (err) sock.emit('error', err);
        else sock.emit('secureConnect');
      });
      return sock;
    }),
  };
  return { default: state, ...state };
});

import tls from 'node:tls';
const fakeTls = tls as unknown as FakeTlsMod;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInner(): HttpClient {
  const fakeRes: HttpResponse = {
    status: 200,
    headers: {},
    text: async () => 'ok',
    json: async <T>() => ({} as T),
  };
  return { send: vi.fn(async (_req: HttpRequest) => fakeRes) };
}

function makeCert(): { raw: Buffer; sha256hex: string; sha256colon: string } {
  // Use a deterministic fake DER blob
  const raw = Buffer.from('fake-cert-der-bytes', 'utf8');
  const sha256hex = crypto.createHash('sha256').update(raw).digest('hex');
  const sha256colon = sha256hex.match(/.{2}/g)!.join(':').toUpperCase();
  return { raw, sha256hex, sha256colon };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createPinnedClient (I2)', () => {
  it('exports createPinnedClient function', async () => {
    const mod = await import('./pinnedClient.js');
    expect(typeof mod.createPinnedClient).toBe('function');
  });

  it('forwards request when cert hash matches (hex)', async () => {
    const { createPinnedClient } = await import('./pinnedClient.js');
    const { raw, sha256hex } = makeCert();
    fakeTls._nextCert = raw;
    fakeTls._nextError = null;

    const inner = makeInner();
    const client = createPinnedClient(inner, sha256hex);
    const res = await client.send({ url: 'https://192.168.1.100/api', timeoutMs: 1000 });
    expect(res.status).toBe(200);
    expect(inner.send).toHaveBeenCalledOnce();
  });

  it('forwards request when cert hash matches (colon-hex, case-insensitive)', async () => {
    const { createPinnedClient } = await import('./pinnedClient.js');
    const { raw, sha256colon } = makeCert();
    fakeTls._nextCert = raw;
    fakeTls._nextError = null;

    const inner = makeInner();
    const client = createPinnedClient(inner, sha256colon);
    const res = await client.send({ url: 'https://192.168.1.100/api', timeoutMs: 1000 });
    expect(res.status).toBe(200);
  });

  it('throws UnauthorizedError when hash mismatches', async () => {
    const { createPinnedClient } = await import('./pinnedClient.js');
    const { raw } = makeCert();
    fakeTls._nextCert = raw;
    fakeTls._nextError = null;

    const inner = makeInner();
    const wrongHash = 'a'.repeat(64);
    const client = createPinnedClient(inner, wrongHash);

    await expect(client.send({ url: 'https://192.168.1.100/api', timeoutMs: 1000 }))
      .rejects.toBeInstanceOf(UnauthorizedError);
    expect(inner.send).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedError with descriptive message on mismatch', async () => {
    const { createPinnedClient } = await import('./pinnedClient.js');
    const { raw } = makeCert();
    fakeTls._nextCert = raw;
    fakeTls._nextError = null;

    const inner = makeInner();
    const client = createPinnedClient(inner, 'deadbeef' + 'a'.repeat(56));
    await expect(client.send({ url: 'https://192.168.1.100/api', timeoutMs: 1000 }))
      .rejects.toThrow(/pin mismatch/);
  });

  it('opens TLS connection to correct host and port', async () => {
    const { createPinnedClient } = await import('./pinnedClient.js');
    const { raw, sha256hex } = makeCert();
    fakeTls._nextCert = raw;
    fakeTls._nextError = null;
    vi.mocked(fakeTls.connect).mockClear();

    const inner = makeInner();
    const client = createPinnedClient(inner, sha256hex);
    await client.send({ url: 'https://192.168.1.100:8443/api' });

    expect(fakeTls.connect).toHaveBeenCalledWith(
      expect.objectContaining({ host: '192.168.1.100', port: 8443 }),
    );
  });

  it('defaults to port 443 for https URLs without explicit port', async () => {
    const { createPinnedClient } = await import('./pinnedClient.js');
    const { raw, sha256hex } = makeCert();
    fakeTls._nextCert = raw;
    fakeTls._nextError = null;
    vi.mocked(fakeTls.connect).mockClear();

    const inner = makeInner();
    const client = createPinnedClient(inner, sha256hex);
    await client.send({ url: 'https://bridge.local/api' });

    expect(fakeTls.connect).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'bridge.local', port: 443 }),
    );
  });

  it('throws when TLS probe errors', async () => {
    const { createPinnedClient } = await import('./pinnedClient.js');
    fakeTls._nextCert = null;
    fakeTls._nextError = new Error('connection refused');

    const inner = makeInner();
    const client = createPinnedClient(inner, 'a'.repeat(64));
    await expect(client.send({ url: 'https://192.168.1.100/api', timeoutMs: 1000 }))
      .rejects.toThrow();
  });
});
