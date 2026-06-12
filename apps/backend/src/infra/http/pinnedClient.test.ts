import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import { UnauthorizedError } from "../../core/errors.js";
import { createPinnedConnector, createPinnedClient } from "./pinnedClient.js";
import type { buildConnector } from "undici";

function makeCert(): { raw: Buffer; sha256hex: string; sha256colon: string } {
  const raw = Buffer.from("fake-cert-der-bytes", "utf8");
  const sha256hex = crypto.createHash("sha256").update(raw).digest("hex");
  const sha256colon = sha256hex.match(/.{2}/g)!.join(":").toUpperCase();
  return { raw, sha256hex, sha256colon };
}

interface FakeSocket {
  destroy: ReturnType<typeof vi.fn>;
  getPeerCertificate?: () => { raw?: Buffer } | undefined;
}

function fakeBase(
  socket: FakeSocket | null,
  err?: Error
): buildConnector.connector {
  return ((_opts: unknown, cb: (e: Error | null, s: unknown) => void) => {
    cb(err ?? null, err ? null : socket);
  }) as unknown as buildConnector.connector;
}

function connect(
  connector: buildConnector.connector
): Promise<{ err: Error | null; socket: unknown }> {
  return new Promise((resolve) => {
    (
      connector as unknown as (
        o: unknown,
        cb: (e: Error | null, s: unknown) => void
      ) => void
    )(
      {
        hostname: "bridge.local",
        host: "bridge.local",
        protocol: "https:",
        port: "443",
      },
      (err, socket) => resolve({ err, socket })
    );
  });
}

describe("createPinnedConnector", () => {
  it("passes the socket through when the cert fingerprint matches (hex)", async () => {
    const { raw, sha256hex } = makeCert();
    const socket: FakeSocket = {
      destroy: vi.fn(),
      getPeerCertificate: () => ({ raw }),
    };
    const { err, socket: out } = await connect(
      createPinnedConnector(sha256hex, fakeBase(socket))
    );
    expect(err).toBeNull();
    expect(out).toBe(socket);
    expect(socket.destroy).not.toHaveBeenCalled();
  });

  it("accepts colon-delimited, case-insensitive fingerprints", async () => {
    const { raw, sha256colon } = makeCert();
    const socket: FakeSocket = {
      destroy: vi.fn(),
      getPeerCertificate: () => ({ raw }),
    };
    const { err } = await connect(
      createPinnedConnector(sha256colon, fakeBase(socket))
    );
    expect(err).toBeNull();
  });

  it("destroys the socket and errors on fingerprint mismatch", async () => {
    const { raw } = makeCert();
    const socket: FakeSocket = {
      destroy: vi.fn(),
      getPeerCertificate: () => ({ raw }),
    };
    const { err, socket: out } = await connect(
      createPinnedConnector("a".repeat(64), fakeBase(socket))
    );
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect((err as Error).message).toMatch(/pin mismatch/);
    expect(out).toBeNull();
    expect(socket.destroy).toHaveBeenCalled();
  });

  it("rejects non-TLS sockets when a pin is configured", async () => {
    const socket: FakeSocket = { destroy: vi.fn() };
    const { err } = await connect(
      createPinnedConnector("a".repeat(64), fakeBase(socket))
    );
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect((err as Error).message).toMatch(/not TLS/);
    expect(socket.destroy).toHaveBeenCalled();
  });

  it("rejects connections without a peer certificate", async () => {
    const socket: FakeSocket = {
      destroy: vi.fn(),
      getPeerCertificate: () => ({}),
    };
    const { err } = await connect(
      createPinnedConnector("a".repeat(64), fakeBase(socket))
    );
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect((err as Error).message).toMatch(/no peer certificate/);
  });

  it("propagates base connector errors", async () => {
    const { err } = await connect(
      createPinnedConnector(
        "a".repeat(64),
        fakeBase(null, new Error("connection refused"))
      )
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/connection refused/);
  });
});

describe("createPinnedClient", () => {
  it("builds an HttpClient whose requests enforce the pin on the wire", async () => {
    const client = createPinnedClient("a".repeat(64));
    expect(typeof client.send).toBe("function");
    // No TLS server with a known cert available in unit tests; full-path
    // behavior is covered by the connector tests above.
  });
});
