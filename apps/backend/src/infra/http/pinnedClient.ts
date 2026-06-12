import tls from "node:tls";
import crypto from "node:crypto";
import { Agent, buildConnector } from "undici";
import { UnauthorizedError, UnavailableError } from "../../core/errors.js";
import { createHttpClient } from "./client.js";
import type { HttpClient } from "./client.js";

function normalizeHash(hash: string): string {
  return hash.replace(/:/g, "").toLowerCase();
}

/**
 * One-shot fingerprint discovery (e.g. setup flow showing the bridge cert to
 * pin). NOT an enforcement mechanism — enforcement happens on the request
 * connection itself via createPinnedClient.
 */
export function probeCertFingerprint(
  host: string,
  port: number,
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, rejectUnauthorized: false });

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new UnavailableError(`cert probe timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.once("secureConnect", () => {
      clearTimeout(timer);
      const cert = socket.getPeerCertificate();
      socket.destroy();
      if (!cert?.raw) {
        reject(new UnavailableError("no peer certificate received"));
        return;
      }
      const fingerprint = crypto
        .createHash("sha256")
        .update(cert.raw)
        .digest("hex");
      resolve(fingerprint);
    });

    socket.once("error", (e: Error) => {
      clearTimeout(timer);
      reject(new UnavailableError(`cert probe failed: ${e.message}`));
    });
  });
}

type PinnedSocket = {
  destroy(): void;
  getPeerCertificate?: () => { raw?: Buffer } | undefined;
};

/**
 * Wrap an undici connector so the peer certificate of the connection that
 * will actually carry the request is fingerprint-checked during the TLS
 * handshake. Mismatches destroy the socket before any data is sent — no
 * probe-then-send TOCTOU window.
 */
export function createPinnedConnector(
  expectedSha256: string,
  base?: buildConnector.connector
): buildConnector.connector {
  const expected = normalizeHash(expectedSha256);
  // Self-signed device certs (e.g. Hue bridges) fail default verification;
  // identity is established by the pin instead.
  const inner = base ?? buildConnector({ rejectUnauthorized: false });
  return (opts, callback) => {
    inner(opts, (err, socket) => {
      if (err || !socket) {
        callback(err ?? new UnavailableError("connect failed"), null);
        return;
      }
      const pinned = socket as unknown as PinnedSocket;
      if (typeof pinned.getPeerCertificate !== "function") {
        pinned.destroy();
        callback(
          new UnauthorizedError(
            `cert pin configured for ${String(opts.hostname)} but connection is not TLS`
          ),
          null
        );
        return;
      }
      const cert = pinned.getPeerCertificate();
      if (!cert?.raw) {
        pinned.destroy();
        callback(new UnauthorizedError("no peer certificate received"), null);
        return;
      }
      const actual = crypto.createHash("sha256").update(cert.raw).digest("hex");
      if (actual !== expected) {
        pinned.destroy();
        callback(
          new UnauthorizedError(
            `cert pin mismatch for ${String(opts.hostname)}: expected ${expected}, got ${actual}`
          ),
          null
        );
        return;
      }
      callback(null, socket);
    });
  };
}

/**
 * HttpClient with SHA-256 certificate pinning enforced on the request
 * connection. Accepts plain hex or colon-delimited hex (case-insensitive).
 * Pin mismatches surface as UnauthorizedError.
 */
export function createPinnedClient(expectedSha256: string): HttpClient {
  return createHttpClient({
    dispatcher: createPinnedDispatcher(expectedSha256),
  });
}

/** Undici dispatcher whose TLS handshakes enforce the certificate pin —
 *  usable for plain requests and long-lived streams (SSE) alike. */
export function createPinnedDispatcher(expectedSha256: string): Agent {
  return new Agent({
    connect: createPinnedConnector(expectedSha256),
  });
}
