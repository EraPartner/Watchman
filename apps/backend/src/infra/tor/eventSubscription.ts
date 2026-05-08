import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { UnavailableError, UnauthorizedError } from '../../core/errors.js';
import type { TorControlConnectOpts } from './controlClient.js';

export type TorEventHandler = (event: string, args: string[]) => void;

export interface TorEventSubscription {
  setevents(events: string[], signal: AbortSignal): Promise<void>;
  on(event: string, handler: TorEventHandler): void;
  close(): Promise<void>;
}

export interface TorEventSubscriptionFactory {
  create(opts: TorControlConnectOpts, signal: AbortSignal): Promise<TorEventSubscription>;
}

export function createTorEventSubscriptionFactory(): TorEventSubscriptionFactory {
  return {
    create(opts, signal) {
      return openSubscription(opts, signal);
    },
  };
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function openSubscription(
  opts: TorControlConnectOpts,
  signal: AbortSignal,
): Promise<TorEventSubscription> {
  const socket = await openSocket(opts, signal);
  const sub = new TorEventSubscriptionImpl(socket);
  try {
    await sub.authenticate(opts.password, signal, opts.cookieAuthFile);
  } catch (e) {
    await sub.close().catch(() => undefined);
    throw e;
  }
  return sub;
}

function openSocket(opts: TorControlConnectOpts, signal: AbortSignal): Promise<net.Socket> {
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (result: Error | net.Socket): void => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      if (signal) signal.removeEventListener('abort', onAbort);
      if (result instanceof Error) {
        socket.destroy();
        reject(result);
      } else {
        resolve(result);
      }
    };

    const onAbort = (): void => done(new UnavailableError('tor event subscription connect aborted'));

    if (signal) {
      if (signal.aborted) {
        socket.destroy();
        reject(new UnavailableError('tor event subscription connect aborted'));
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    socket.setTimeout(opts.timeoutMs);
    socket.once('connect', () => done(socket));
    socket.once('timeout', () =>
      done(new UnavailableError(`tor event subscription connect timed out (${opts.timeoutMs}ms)`)),
    );
    socket.once('error', (err) =>
      done(new UnavailableError(`tor event subscription connect failed: ${err.message}`)),
    );
    socket.connect(opts.port, opts.host);
  });
}

class TorEventSubscriptionImpl implements TorEventSubscription {
  private readonly socket: net.Socket;
  private buffer = '';
  private closed = false;
  private closing = false;
  private readonly handlers = new Map<string, TorEventHandler[]>();
  /** FIFO queue of pending reply callbacks — one per command sent */
  private readonly replyWaiters: Array<(line: string | Error) => void> = [];

  constructor(socket: net.Socket) {
    this.socket = socket;
    this.socket.setEncoding('utf8');
    this.socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      this.processBuffer();
    });
    // Prevent unhandled 'error' crashes — individual sendAndWait calls attach their own handlers
    this.socket.on('error', () => undefined);
  }

  private processBuffer(): void {
    let pos = 0;
    while (pos < this.buffer.length) {
      const lineEnd = this.buffer.indexOf('\r\n', pos);
      if (lineEnd === -1) break;

      const line = this.buffer.slice(pos, lineEnd);
      pos = lineEnd + 2;

      if (line.startsWith('650 ')) {
        // Async event: "650 <KEYWORD> [args...]"
        const content = line.slice(4);
        const spaceIdx = content.indexOf(' ');
        const event = spaceIdx >= 0 ? content.slice(0, spaceIdx) : content;
        const args = spaceIdx >= 0 ? content.slice(spaceIdx + 1).split(' ') : [];
        const eventHandlers = this.handlers.get(event) ?? [];
        for (const h of eventHandlers) h(event, args);
        continue;
      }

      if (line.length >= 4 && line[3] === ' ') {
        // Terminal reply line (sep = space)
        const waiter = this.replyWaiters.shift();
        if (waiter) {
          const code = parseInt(line.slice(0, 3), 10);
          if (code >= 400) {
            const msg = line.slice(4);
            const error =
              code === 515
                ? new UnauthorizedError(`tor event auth failed: ${msg}`)
                : new UnavailableError(`tor event control error ${code}: ${msg}`);
            waiter(error);
          } else {
            waiter(line);
          }
        }
        continue;
      }
      // '-' continuation lines: ignored for our command set
    }
    this.buffer = this.buffer.slice(pos);
  }

  async authenticate(password: string, signal: AbortSignal, cookieAuthFile?: string): Promise<void> {
    let cmd: string;
    if (cookieAuthFile && cookieAuthFile.length > 0) {
      const cookieBytes = await readFile(cookieAuthFile);
      cmd = `AUTHENTICATE ${cookieBytes.toString('hex')}\r\n`;
    } else if (password.length > 0) {
      cmd = `AUTHENTICATE "${escapePassword(password)}"\r\n`;
    } else {
      cmd = 'AUTHENTICATE\r\n';
    }
    const reply = await this.sendAndWait(cmd, signal);
    if (!reply.startsWith('250')) {
      const code = reply.slice(0, 3);
      const msg = reply.slice(4);
      if (code === '515') throw new UnauthorizedError(`tor event auth failed: ${msg}`);
      throw new UnavailableError(`tor event auth error ${code}: ${msg}`);
    }
  }

  async setevents(events: string[], signal: AbortSignal): Promise<void> {
    if (this.closed || this.closing) throw new UnavailableError('tor event subscription is closed');
    const cmd = events.length > 0 ? `SETEVENTS ${events.join(' ')}\r\n` : 'SETEVENTS\r\n';
    const reply = await this.sendAndWait(cmd, signal);
    if (!reply.startsWith('250')) {
      const code = reply.slice(0, 3);
      const msg = reply.slice(4);
      throw new UnavailableError(`tor SETEVENTS failed ${code}: ${msg}`);
    }
  }

  on(event: string, handler: TorEventHandler): void {
    const existing = this.handlers.get(event);
    if (existing) {
      existing.push(handler);
    } else {
      this.handlers.set(event, [handler]);
    }
  }

  async close(): Promise<void> {
    if (this.closed || this.closing) return;
    this.closing = true;
    const noop = new AbortController();
    try {
      // Clear all event subscriptions
      await this.sendAndWait('SETEVENTS\r\n', noop.signal);
    } catch {
      // ignore
    }
    try {
      await this.sendAndWait('QUIT\r\n', noop.signal);
    } catch {
      // ignore
    }
    this.closed = true;
    this.socket.destroy();
  }

  private sendAndWait(cmd: string, signal: AbortSignal): Promise<string> {
    return new Promise<string>((resolve, reject) => {

      let cleaned = false;
      const cleanup = (): void => {
        if (cleaned) return;
        cleaned = true;
        const idx = this.replyWaiters.indexOf(onReply);
        if (idx >= 0) this.replyWaiters.splice(idx, 1);
        signal.removeEventListener('abort', onAbort);
        this.socket.off('error', onSocketError);
        this.socket.off('close', onSocketClose);
      };

      const onReply = (line: string | Error): void => {
        cleanup();
        if (line instanceof Error) reject(line);
        else resolve(line);
      };

      const onAbort = (): void => {
        cleanup();
        reject(new UnavailableError('tor event subscription aborted'));
      };

      const onSocketError = (err: Error): void => {
        cleanup();
        reject(new UnavailableError(`tor event subscription socket error: ${err.message}`));
      };
      const onSocketClose = (): void => {
        cleanup();
        reject(new UnavailableError('tor event subscription socket closed unexpectedly'));
      };

      signal.addEventListener('abort', onAbort, { once: true });
      this.socket.once('error', onSocketError);
      this.socket.once('close', onSocketClose);
      this.replyWaiters.push(onReply);

      this.socket.write(cmd, 'utf8', (err) => {
        if (err) {
          cleanup();
          reject(new UnavailableError(`tor event subscription write failed: ${err.message}`));
        }
      });
    });
  }
}

function escapePassword(password: string): string {
  return password.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
