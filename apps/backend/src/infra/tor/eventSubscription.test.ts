import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as net from 'node:net';
import { createTorEventSubscriptionFactory } from './eventSubscription.js';
import { UnavailableError, UnauthorizedError } from '../../core/errors.js';

let server: net.Server;
let port: number;
let serverHandler: ((socket: net.Socket) => void) | null = null;

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = net.createServer((socket) => {
        if (serverHandler) serverHandler(socket);
        else socket.destroy();
      });
      server.listen(0, () => {
        port = (server.address() as net.AddressInfo).port;
        resolve();
      });
    }),
);

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  serverHandler = null;
});

/**
 * Helper: simple line-based responder. For each CRLF-terminated command line,
 * finds first matching key and writes the associated response.
 */
function torResponder(responses: Record<string, string>) {
  return (socket: net.Socket): void => {
    socket.setEncoding('utf8');
    socket.on('error', () => undefined);
    let buf = '';
    socket.on('data', (chunk: string) => {
      buf += chunk;
      while (buf.includes('\r\n')) {
        const idx = buf.indexOf('\r\n');
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const key = Object.keys(responses).find((k) => line.startsWith(k));
        if (key) socket.write(responses[key] as string);
      }
    });
  };
}

const OPTS = { host: '127.0.0.1', timeoutMs: 2_000 };

describe('createTorEventSubscriptionFactory', () => {
  it('authenticates and setevents resolves on 250 OK', async () => {
    const received: string[] = [];
    serverHandler = (socket) => {
      socket.setEncoding('utf8');
      socket.on('error', () => undefined);
      let buf = '';
      socket.on('data', (chunk: string) => {
        buf += chunk;
        while (buf.includes('\r\n')) {
          const idx = buf.indexOf('\r\n');
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          received.push(line);
          if (line.startsWith('AUTHENTICATE')) socket.write('250 OK\r\n');
          else if (line.startsWith('SETEVENTS')) socket.write('250 OK\r\n');
          else if (line.startsWith('QUIT')) {
            socket.write('250 Closing connection\r\n');
            socket.end();
          }
        }
      });
    };

    const factory = createTorEventSubscriptionFactory();
    const sub = await factory.create({ ...OPTS, port, password: '' }, new AbortController().signal);
    await sub.setevents(['BW'], new AbortController().signal);
    await sub.close();

    expect(received[0]).toBe('AUTHENTICATE');
    expect(received).toContain('SETEVENTS BW');
  });

  it('setevents with multiple events sends space-separated list', async () => {
    const received: string[] = [];
    serverHandler = (socket) => {
      socket.setEncoding('utf8');
      socket.on('error', () => undefined);
      let buf = '';
      socket.on('data', (chunk: string) => {
        buf += chunk;
        while (buf.includes('\r\n')) {
          const idx = buf.indexOf('\r\n');
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          received.push(line);
          if (line.startsWith('AUTHENTICATE')) socket.write('250 OK\r\n');
          else if (line.startsWith('SETEVENTS')) socket.write('250 OK\r\n');
          else if (line.startsWith('QUIT')) {
            socket.write('250 Closing connection\r\n');
            socket.end();
          }
        }
      });
    };

    const factory = createTorEventSubscriptionFactory();
    const sub = await factory.create({ ...OPTS, port, password: '' }, new AbortController().signal);
    await sub.setevents(['BW', 'CIRC'], new AbortController().signal);
    await sub.close();

    expect(received).toContain('SETEVENTS BW CIRC');
  });

  it('fires registered handler when 650 BW event arrives', async () => {
    let serverSocket: net.Socket | null = null;
    serverHandler = (socket) => {
      serverSocket = socket;
      socket.setEncoding('utf8');
      socket.on('error', () => undefined);
      let buf = '';
      socket.on('data', (chunk: string) => {
        buf += chunk;
        while (buf.includes('\r\n')) {
          const idx = buf.indexOf('\r\n');
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          if (line.startsWith('AUTHENTICATE')) socket.write('250 OK\r\n');
          else if (line.startsWith('SETEVENTS')) socket.write('250 OK\r\n');
          else if (line.startsWith('QUIT')) {
            socket.write('250 Closing connection\r\n');
            socket.end();
          }
        }
      });
    };

    const factory = createTorEventSubscriptionFactory();
    const sub = await factory.create({ ...OPTS, port, password: '' }, new AbortController().signal);
    await sub.setevents(['BW'], new AbortController().signal);

    const received: { event: string; args: string[] }[] = [];
    sub.on('BW', (event, args) => received.push({ event, args }));

    // Server pushes async event
    serverSocket!.write('650 BW 512 256\r\n');

    // Give the data event a tick to process
    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    await sub.close();

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ event: 'BW', args: ['512', '256'] });
  });

  it('close sends empty SETEVENTS (clear) then QUIT', async () => {
    const received: string[] = [];
    serverHandler = (socket) => {
      socket.setEncoding('utf8');
      socket.on('error', () => undefined);
      let buf = '';
      socket.on('data', (chunk: string) => {
        buf += chunk;
        while (buf.includes('\r\n')) {
          const idx = buf.indexOf('\r\n');
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          received.push(line);
          if (line.startsWith('AUTHENTICATE')) socket.write('250 OK\r\n');
          else if (line === 'SETEVENTS') socket.write('250 OK\r\n'); // empty clear
          else if (line.startsWith('SETEVENTS')) socket.write('250 OK\r\n');
          else if (line.startsWith('QUIT')) {
            socket.write('250 Closing connection\r\n');
            socket.end();
          }
        }
      });
    };

    const factory = createTorEventSubscriptionFactory();
    const sub = await factory.create({ ...OPTS, port, password: '' }, new AbortController().signal);
    await sub.setevents(['BW'], new AbortController().signal);
    await sub.close();

    // close() should send SETEVENTS (no args = clear all) then QUIT
    expect(received).toContain('SETEVENTS');
    expect(received).toContain('QUIT');
    // SETEVENTS (clear) must come before QUIT
    expect(received.indexOf('SETEVENTS')).toBeLessThan(received.indexOf('QUIT'));
  });

  it('throws UnauthorizedError on 515 auth response', async () => {
    serverHandler = (socket) => {
      socket.setEncoding('utf8');
      socket.on('error', () => undefined);
      socket.on('data', () => {
        socket.write('515 Authentication failed: Wrong password\r\n');
        socket.end();
      });
    };

    const factory = createTorEventSubscriptionFactory();
    await expect(
      factory.create({ ...OPTS, port, password: 'wrong' }, new AbortController().signal),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws UnavailableError on non-515 auth error', async () => {
    serverHandler = (socket) => {
      socket.setEncoding('utf8');
      socket.on('error', () => undefined);
      socket.on('data', () => {
        socket.write('500 Internal error\r\n');
        socket.end();
      });
    };

    const factory = createTorEventSubscriptionFactory();
    await expect(
      factory.create({ ...OPTS, port, password: 'pw' }, new AbortController().signal),
    ).rejects.toBeInstanceOf(UnavailableError);
  });

  it('setevents throws UnavailableError on 552 error response', async () => {
    serverHandler = torResponder({
      'AUTHENTICATE': '250 OK\r\n',
      'SETEVENTS': '552 Unknown event "BADNAME"\r\n',
      'QUIT': '250 Closing connection\r\n',
    });

    const factory = createTorEventSubscriptionFactory();
    const sub = await factory.create({ ...OPTS, port, password: '' }, new AbortController().signal);
    await expect(
      sub.setevents(['BADNAME'], new AbortController().signal),
    ).rejects.toBeInstanceOf(UnavailableError);
    await sub.close().catch(() => undefined);
  });

  it('throws UnavailableError when connection refused', async () => {
    const factory = createTorEventSubscriptionFactory();
    await expect(
      factory.create({ ...OPTS, port: 1, password: '' }, new AbortController().signal),
    ).rejects.toBeInstanceOf(UnavailableError);
  });
});
