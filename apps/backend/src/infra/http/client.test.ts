import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHttpClient } from './client.js';
import { TimeoutError, UnavailableError } from '../../core/errors.js';

let server: Server;
let port: number;

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer((req, res) => {
        if (req.url === '/ok') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ hi: 'there' }));
        } else if (req.url === '/slow') {
          setTimeout(() => {
            res.writeHead(200);
            res.end('late');
          }, 200);
        } else if (req.url === '/text') {
          res.writeHead(200);
          res.end('plain');
        } else {
          res.writeHead(404);
          res.end();
        }
      });
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

describe('HttpClient', () => {
  it('sends GET and parses json', async () => {
    const client = createHttpClient();
    const res = await client.send({ url: `http://127.0.0.1:${port}/ok` });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hi: 'there' });
  });

  it('reads text body', async () => {
    const client = createHttpClient();
    const res = await client.send({ url: `http://127.0.0.1:${port}/text` });
    expect(await res.text()).toBe('plain');
  });

  it('throws TimeoutError on timeout', async () => {
    const client = createHttpClient({ defaultTimeoutMs: 30 });
    await expect(
      client.send({ url: `http://127.0.0.1:${port}/slow` }),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('throws UnavailableError on connection failure', async () => {
    const client = createHttpClient();
    await expect(
      client.send({ url: 'http://127.0.0.1:1/no' }),
    ).rejects.toBeInstanceOf(UnavailableError);
  });
});
