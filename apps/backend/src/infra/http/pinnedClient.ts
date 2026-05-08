import tls from 'node:tls';
import crypto from 'node:crypto';
import { UnauthorizedError, UnavailableError } from '../../core/errors.js';
import type { HttpClient, HttpRequest, HttpResponse } from './client.js';

function normalizeHash(hash: string): string {
  return hash.replace(/:/g, '').toLowerCase();
}

function parseHostPort(url: string): { host: string; port: number } {
  const parsed = new URL(url);
  const explicitPort = parsed.port ? parseInt(parsed.port, 10) : null;
  const defaultPort = parsed.protocol === 'https:' ? 443 : 80;
  return { host: parsed.hostname, port: explicitPort ?? defaultPort };
}

export function probeCertFingerprint(host: string, port: number, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, rejectUnauthorized: false });

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new UnavailableError(`cert probe timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.once('secureConnect', () => {
      clearTimeout(timer);
      const cert = socket.getPeerCertificate();
      socket.destroy();
      if (!cert?.raw) {
        reject(new UnavailableError('no peer certificate received'));
        return;
      }
      const fingerprint = crypto.createHash('sha256').update(cert.raw).digest('hex');
      resolve(fingerprint);
    });

    socket.once('error', (e: Error) => {
      clearTimeout(timer);
      reject(new UnavailableError(`cert probe failed: ${e.message}`));
    });
  });
}

/**
 * Wrap an HttpClient with SHA-256 certificate pinning.
 * Every request first probes the TLS cert and compares its SHA-256 fingerprint
 * against `expectedSha256`. Accepts both plain hex and colon-delimited hex
 * (case-insensitive). Throws UnauthorizedError on mismatch.
 */
export function createPinnedClient(inner: HttpClient, expectedSha256: string): HttpClient {
  const expected = normalizeHash(expectedSha256);
  return {
    async send(req: HttpRequest): Promise<HttpResponse> {
      const { host, port } = parseHostPort(req.url);
      const timeoutMs = req.timeoutMs ?? 5_000;
      const actual = await probeCertFingerprint(host, port, timeoutMs);
      if (actual !== expected) {
        throw new UnauthorizedError(
          `cert pin mismatch for ${host}: expected ${expected}, got ${actual}`,
        );
      }
      return inner.send(req);
    },
  };
}
