import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as net from 'node:net';
import * as fs from 'node:fs/promises';
import { createTorControlClient } from './controlClient.js';
import { UnavailableError, UnauthorizedError } from '../../core/errors.js';

vi.mock('node:fs/promises');

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

afterEach(() => {
  vi.clearAllMocks();
});

/**
 * Build a simple line-based Tor control responder.
 * For each incoming command line, finds the first key in `responses` that the
 * line starts with and writes the associated response string back verbatim.
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

describe('createTorControlClient', () => {
  it('connects with password and getinfo returns parsed value', async () => {
    serverHandler = torResponder({
      'AUTHENTICATE': '250 OK\r\n',
      'GETINFO traffic/read': '250-traffic/read=1024\r\n250 OK\r\n',
      'QUIT': '250 Closing connection\r\n',
    });
    const client = createTorControlClient();
    const handle = await client.connect({ ...OPTS, port, password: 'secret' }, new AbortController().signal);
    const info = await handle.getinfo(['traffic/read'], new AbortController().signal);
    expect(info.get('traffic/read')).toBe('1024');
    await handle.close();
  });

  it('sends AUTHENTICATE without quotes when password is empty', async () => {
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
          else if (line.startsWith('QUIT')) {
            socket.write('250 Closing connection\r\n');
            socket.end();
          }
        }
      });
    };
    const client = createTorControlClient();
    const handle = await client.connect({ ...OPTS, port, password: '' }, new AbortController().signal);
    await handle.close();
    expect(received[0]).toBe('AUTHENTICATE');
  });

  it('getinfo returns multiple keys from continuation lines', async () => {
    serverHandler = torResponder({
      'AUTHENTICATE': '250 OK\r\n',
      'GETINFO traffic/read': '250-traffic/read=2048\r\n250-traffic/written=1024\r\n250 OK\r\n',
      'QUIT': '250 Closing connection\r\n',
    });
    const client = createTorControlClient();
    const handle = await client.connect({ ...OPTS, port, password: '' }, new AbortController().signal);
    const info = await handle.getinfo(['traffic/read', 'traffic/written'], new AbortController().signal);
    expect(info.get('traffic/read')).toBe('2048');
    expect(info.get('traffic/written')).toBe('1024');
    await handle.close();
  });

  it('parses multi-line GETINFO value (+ separator)', async () => {
    serverHandler = torResponder({
      'AUTHENTICATE': '250 OK\r\n',
      'GETINFO ns/all': '250+ns/all=\r\nfirst line\r\nsecond line\r\n.\r\n250 OK\r\n',
      'QUIT': '250 Closing connection\r\n',
    });
    const client = createTorControlClient();
    const handle = await client.connect({ ...OPTS, port, password: '' }, new AbortController().signal);
    const info = await handle.getinfo(['ns/all'], new AbortController().signal);
    expect(info.get('ns/all')).toBe('first line\nsecond line');
    await handle.close();
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
    const client = createTorControlClient();
    await expect(
      client.connect({ ...OPTS, port, password: 'wrong' }, new AbortController().signal),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws UnavailableError on non-515 auth error', async () => {
    serverHandler = (socket) => {
      socket.setEncoding('utf8');
      socket.on('error', () => undefined);
      socket.on('data', () => {
        socket.write('500 Internal server error\r\n');
        socket.end();
      });
    };
    const client = createTorControlClient();
    await expect(
      client.connect({ ...OPTS, port, password: 'pw' }, new AbortController().signal),
    ).rejects.toBeInstanceOf(UnavailableError);
  });

  it('getinfo throws UnavailableError on 5xx error response', async () => {
    serverHandler = torResponder({
      'AUTHENTICATE': '250 OK\r\n',
      'GETINFO nonexistent': '552 Unknown keyword "nonexistent"\r\n',
    });
    const client = createTorControlClient();
    const handle = await client.connect({ ...OPTS, port, password: '' }, new AbortController().signal);
    await expect(
      handle.getinfo(['nonexistent'], new AbortController().signal),
    ).rejects.toBeInstanceOf(UnavailableError);
    await handle.close().catch(() => undefined);
  });

  it('throws UnavailableError when connection is refused', async () => {
    const client = createTorControlClient();
    await expect(
      client.connect({ ...OPTS, port: 1, password: '' }, new AbortController().signal),
    ).rejects.toBeInstanceOf(UnavailableError);
  });

  it('close makes the handle unusable for further commands', async () => {
    serverHandler = torResponder({
      'AUTHENTICATE': '250 OK\r\n',
      'QUIT': '250 Closing connection\r\n',
    });
    const client = createTorControlClient();
    const handle = await client.connect({ ...OPTS, port, password: '' }, new AbortController().signal);
    await handle.close();
    // After close(), this.closed = true, so send() rejects immediately without touching the socket
    await expect(
      handle.getinfo(['traffic/read'], new AbortController().signal),
    ).rejects.toBeInstanceOf(UnavailableError);
  });
});

describe('cookie auth', () => {
  it('sends AUTHENTICATE <hex> (no quotes) when cookieAuthFile is provided', async () => {
    const cookieBytes = Buffer.alloc(32, 0xab);
    vi.mocked(fs.readFile).mockResolvedValueOnce(cookieBytes as never);

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
          else if (line.startsWith('QUIT')) {
            socket.write('250 Closing connection\r\n');
            socket.end();
          }
        }
      });
    };

    const client = createTorControlClient();
    const handle = await client.connect(
      { ...OPTS, port, password: '', cookieAuthFile: '/var/lib/tor/control_auth_cookie' },
      new AbortController().signal,
    );
    await handle.close();

    expect(received[0]).toBe(`AUTHENTICATE ${'ab'.repeat(32)}`);
  });

  it('cookie auth succeeds and handle is usable', async () => {
    const cookieBytes = Buffer.alloc(32, 0xcd);
    vi.mocked(fs.readFile).mockResolvedValueOnce(cookieBytes as never);

    serverHandler = torResponder({
      'AUTHENTICATE': '250 OK\r\n',
      'GETINFO traffic/read': '250-traffic/read=512\r\n250 OK\r\n',
      'QUIT': '250 Closing connection\r\n',
    });

    const client = createTorControlClient();
    const handle = await client.connect(
      { ...OPTS, port, password: '', cookieAuthFile: '/tmp/cookie' },
      new AbortController().signal,
    );
    const info = await handle.getinfo(['traffic/read'], new AbortController().signal);
    expect(info.get('traffic/read')).toBe('512');
    await handle.close();
  });

  it('throws UnauthorizedError on 515 with cookie auth', async () => {
    const cookieBytes = Buffer.alloc(32, 0xef);
    vi.mocked(fs.readFile).mockResolvedValueOnce(cookieBytes as never);

    serverHandler = (socket) => {
      socket.setEncoding('utf8');
      socket.on('error', () => undefined);
      socket.on('data', () => {
        socket.write('515 Authentication failed: Wrong cookie\r\n');
        socket.end();
      });
    };

    const client = createTorControlClient();
    await expect(
      client.connect(
        { ...OPTS, port, password: '', cookieAuthFile: '/tmp/cookie' },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('getconf', () => {
  it('returns a single config key', async () => {
    serverHandler = torResponder({
      'AUTHENTICATE': '250 OK\r\n',
      'GETCONF SocksPort': '250-SocksPort=9050\r\n250 OK\r\n',
      'QUIT': '250 Closing connection\r\n',
    });
    const client = createTorControlClient();
    const handle = await client.connect({ ...OPTS, port, password: '' }, new AbortController().signal);
    const conf = await handle.getconf(['SocksPort'], new AbortController().signal);
    expect(conf.get('SocksPort')).toBe('9050');
    await handle.close();
  });

  it('returns multiple config keys', async () => {
    serverHandler = torResponder({
      'AUTHENTICATE': '250 OK\r\n',
      'GETCONF DataDirectory SocksPort': '250-DataDirectory=/var/lib/tor\r\n250-SocksPort=9050\r\n250 OK\r\n',
      'QUIT': '250 Closing connection\r\n',
    });
    const client = createTorControlClient();
    const handle = await client.connect({ ...OPTS, port, password: '' }, new AbortController().signal);
    const conf = await handle.getconf(['DataDirectory', 'SocksPort'], new AbortController().signal);
    expect(conf.get('DataDirectory')).toBe('/var/lib/tor');
    expect(conf.get('SocksPort')).toBe('9050');
    await handle.close();
  });

  it('returns empty map for empty key list', async () => {
    serverHandler = torResponder({
      'AUTHENTICATE': '250 OK\r\n',
      'QUIT': '250 Closing connection\r\n',
    });
    const client = createTorControlClient();
    const handle = await client.connect({ ...OPTS, port, password: '' }, new AbortController().signal);
    const conf = await handle.getconf([], new AbortController().signal);
    expect(conf.size).toBe(0);
    await handle.close();
  });
});

describe('signal', () => {
  it('sends SIGNAL command and resolves on 250 OK', async () => {
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
          else if (line.startsWith('SIGNAL')) socket.write('250 OK\r\n');
          else if (line.startsWith('QUIT')) {
            socket.write('250 Closing connection\r\n');
            socket.end();
          }
        }
      });
    };
    const client = createTorControlClient();
    const handle = await client.connect({ ...OPTS, port, password: '' }, new AbortController().signal);
    await handle.signal('NEWNYM', new AbortController().signal);
    await handle.close();
    expect(received).toContain('SIGNAL NEWNYM');
  });

  it('throws UnavailableError on non-250 SIGNAL response', async () => {
    serverHandler = torResponder({
      'AUTHENTICATE': '250 OK\r\n',
      'SIGNAL': '552 Unknown signal "BADVAL"\r\n',
      'QUIT': '250 Closing connection\r\n',
    });
    const client = createTorControlClient();
    const handle = await client.connect({ ...OPTS, port, password: '' }, new AbortController().signal);
    await expect(
      handle.signal('BADVAL', new AbortController().signal),
    ).rejects.toBeInstanceOf(UnavailableError);
    await handle.close().catch(() => undefined);
  });
});
