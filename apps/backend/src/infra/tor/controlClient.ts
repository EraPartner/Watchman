import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { UnavailableError, UnauthorizedError } from '../../core/errors.js';

export interface TorControlConnectOpts {
  host: string;
  port: number;
  password: string;
  cookieAuthFile?: string;
  timeoutMs: number;
}

export interface TorControlHandle {
  getinfo(keys: string[], signal: AbortSignal): Promise<Map<string, string>>;
  getconf(keys: string[], signal: AbortSignal): Promise<Map<string, string>>;
  signal(name: string, signal: AbortSignal): Promise<void>;
  close(): Promise<void>;
}

export interface TorControlClient {
  connect(opts: TorControlConnectOpts, signal: AbortSignal): Promise<TorControlHandle>;
}

export function createTorControlClient(): TorControlClient {
  return {
    connect(opts, signal) {
      return openHandle(opts, signal);
    },
  };
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function openHandle(opts: TorControlConnectOpts, signal: AbortSignal): Promise<TorControlHandle> {
  const socket = await openSocket(opts, signal);
  const handle = new TorControlHandleImpl(socket);
  try {
    await handle.authenticate(opts.password, signal, opts.cookieAuthFile);
  } catch (e) {
    await handle.close().catch(() => undefined);
    throw e;
  }
  return handle;
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

    const onAbort = (): void => done(new UnavailableError('tor control connect aborted'));

    if (signal) {
      if (signal.aborted) {
        socket.destroy();
        reject(new UnavailableError('tor control connect aborted'));
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    socket.setTimeout(opts.timeoutMs);
    socket.once('connect', () => done(socket));
    socket.once('timeout', () => done(new UnavailableError(`tor control connect timed out (${opts.timeoutMs}ms)`)));
    socket.once('error', (err) => done(new UnavailableError(`tor control connect failed: ${err.message}`)));
    socket.connect(opts.port, opts.host);
  });
}

class TorControlHandleImpl implements TorControlHandle {
  private readonly socket: net.Socket;
  private buffer = '';
  private readonly dataWaiters: Array<() => boolean> = [];
  private closed = false;

  constructor(socket: net.Socket) {
    this.socket = socket;
    this.socket.setEncoding('utf8');
    this.socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      for (let i = 0; i < this.dataWaiters.length; i++) {
        if (this.dataWaiters[i]?.()) {
          this.dataWaiters.splice(i, 1);
          break;
        }
      }
    });
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
    await this.send(cmd);
    const lines = await this.readResponse(signal);
    const first = lines[0] ?? '';
    if (!first.startsWith('250')) {
      const code = first.slice(0, 3);
      const msg = first.slice(4);
      if (code === '515') throw new UnauthorizedError(`tor control auth failed: ${msg}`);
      throw new UnavailableError(`tor control auth error ${code}: ${msg}`);
    }
  }

  async getinfo(keys: string[], signal: AbortSignal): Promise<Map<string, string>> {
    if (keys.length === 0) return new Map();
    await this.send(`GETINFO ${keys.join(' ')}\r\n`);
    const lines = await this.readResponse(signal);
    return parseGetInfoLines(lines);
  }

  async getconf(keys: string[], signal: AbortSignal): Promise<Map<string, string>> {
    if (keys.length === 0) return new Map();
    await this.send(`GETCONF ${keys.join(' ')}\r\n`);
    const lines = await this.readResponse(signal);
    return parseGetInfoLines(lines);
  }

  async signal(name: string, signal: AbortSignal): Promise<void> {
    await this.send(`SIGNAL ${name}\r\n`);
    const lines = await this.readResponse(signal);
    const first = lines[0] ?? '';
    if (!first.startsWith('250')) {
      const code = first.slice(0, 3);
      const msg = first.slice(4);
      throw new UnavailableError(`tor control SIGNAL ${name} failed ${code}: ${msg}`);
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.send('QUIT\r\n');
    } catch {
      // ignore errors during close
    }
    this.socket.destroy();
  }

  private send(data: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.closed) {
        reject(new UnavailableError('tor control socket is closed'));
        return;
      }
      this.socket.write(data, 'utf8', (err) => {
        if (err) reject(new UnavailableError(`tor control write failed: ${err.message}`));
        else resolve();
      });
    });
  }

  private readResponse(signal: AbortSignal): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      const tryParse = (): boolean => {
        const result = extractResponse(this.buffer);
        if (result === null) return false;
        this.buffer = result.remaining;
        if (result.error) reject(result.error);
        else resolve(result.lines);
        return true;
      };

      if (tryParse()) return;

      let cleaned = false;
      const cleanup = (): void => {
        if (cleaned) return;
        cleaned = true;
        const idx = this.dataWaiters.indexOf(check);
        if (idx >= 0) this.dataWaiters.splice(idx, 1);
        signal.removeEventListener('abort', onAbort);
        this.socket.off('error', onError);
        this.socket.off('close', onClose);
      };

      const onAbort = (): void => {
        cleanup();
        reject(new UnavailableError('tor control read aborted'));
      };
      const onError = (err: Error): void => {
        cleanup();
        reject(new UnavailableError(`tor control socket error: ${err.message}`));
      };
      const onClose = (): void => {
        cleanup();
        reject(new UnavailableError('tor control socket closed unexpectedly'));
      };
      const check = (): boolean => {
        const done = tryParse();
        if (done) cleanup();
        return done;
      };

      signal.addEventListener('abort', onAbort, { once: true });
      this.socket.once('error', onError);
      this.socket.once('close', onClose);
      this.dataWaiters.push(check);
    });
  }
}

// ─── Protocol parsing ────────────────────────────────────────────────────────

interface ResponseResult {
  lines: string[];
  remaining: string;
  error?: Error;
}

/**
 * Attempt to extract a complete Tor control response from the accumulated buffer.
 * Returns null if the buffer does not yet contain a full response.
 *
 * Tor control protocol response format:
 *   NNN-text      continuation line (more follows)
 *   NNN text      final line
 *   NNN+keyword=  start of multi-line data (ends with "." on its own line)
 */
function extractResponse(text: string): ResponseResult | null {
  const lines: string[] = [];
  let pos = 0;
  let inMultiLine = false;

  while (pos < text.length) {
    const lineEnd = text.indexOf('\r\n', pos);
    if (lineEnd === -1) return null; // incomplete

    const line = text.slice(pos, lineEnd);
    pos = lineEnd + 2;

    if (inMultiLine) {
      lines.push(line);
      if (line === '.') inMultiLine = false;
      continue;
    }

    lines.push(line);

    if (line.length < 4) continue;
    const sep = line[3];

    if (sep === ' ') {
      const code = parseInt(line.slice(0, 3), 10);
      const remaining = text.slice(pos);
      if (code >= 400) {
        const msg = line.slice(4);
        // 515 = Bad authentication — use UnauthorizedError so callers can distinguish auth failures
        const error = code === 515
          ? new UnauthorizedError(`tor control auth failed: ${msg}`)
          : new UnavailableError(`tor control error ${code}: ${msg}`);
        return { lines, remaining, error };
      }
      return { lines, remaining };
    } else if (sep === '+') {
      inMultiLine = true;
    }
    // sep === '-': continuation, keep reading
  }

  return null; // incomplete
}

function parseGetInfoLines(lines: string[]): Map<string, string> {
  const result = new Map<string, string>();
  let currentKey: string | null = null;
  const currentData: string[] = [];
  let inMultiLine = false;

  for (const line of lines) {
    if (inMultiLine) {
      if (line === '.') {
        if (currentKey !== null) result.set(currentKey, currentData.join('\n'));
        currentKey = null;
        currentData.length = 0;
        inMultiLine = false;
      } else {
        currentData.push(line);
      }
      continue;
    }

    if (line.length < 4) continue;
    const code = line.slice(0, 3);
    if (code !== '250') continue;
    const sep = line[3];
    const content = line.slice(4);

    if (sep === ' ' || sep === '-') {
      if (content === 'OK') continue;
      const eqIdx = content.indexOf('=');
      if (eqIdx >= 0) result.set(content.slice(0, eqIdx), content.slice(eqIdx + 1));
    } else if (sep === '+') {
      const eqIdx = content.indexOf('=');
      if (eqIdx >= 0) {
        currentKey = content.slice(0, eqIdx);
        currentData.length = 0;
        inMultiLine = true;
      }
    }
  }

  return result;
}

function escapePassword(password: string): string {
  return password.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
