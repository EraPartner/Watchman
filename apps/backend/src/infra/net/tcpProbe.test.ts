import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import net from 'node:net';
import { createTcpProber } from './tcpProbe.js';

let server: net.Server;
let port: number;

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = net.createServer((s) => s.end());
      server.listen(0, () => {
        const addr = server.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    }),
);

afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    }),
);

describe('tcpProbe', () => {
  it('returns true for open port', async () => {
    const prober = createTcpProber();
    const ok = await prober.probe({ host: '127.0.0.1', port, timeoutMs: 1000 });
    expect(ok).toBe(true);
  });

  it('returns false for closed port', async () => {
    const prober = createTcpProber();
    const ok = await prober.probe({ host: '127.0.0.1', port: 1, timeoutMs: 500 });
    expect(ok).toBe(false);
  });

  it('honors pre-aborted signal', async () => {
    const prober = createTcpProber();
    const controller = new AbortController();
    controller.abort();
    const ok = await prober.probe({ host: '127.0.0.1', port, timeoutMs: 1000, signal: controller.signal });
    expect(ok).toBe(false);
  });
});
