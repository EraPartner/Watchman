import { readFile } from 'node:fs/promises';
import { Client } from 'ssh2';
import { TimeoutError, UnavailableError, UnauthorizedError } from '../../core/errors.js';
import type { SshExecRequest, SshExecResult, SshExecutor } from './sshExecutor.js';

export interface SshPool extends SshExecutor {
  /** Close all persistent connections and release resources. */
  destroy(): void;
}

type PoolKey = string;
type PoolState = 'connecting' | 'ready' | 'reconnecting' | 'destroyed';

interface PendingExec {
  req: SshExecRequest;
  resolve: (result: SshExecResult) => void;
  reject: (error: Error) => void;
}

interface PoolEntry {
  client: Client;
  state: PoolState;
  pending: PendingExec[];
  connectArgs: ConnectArgs;
}

interface ConnectArgs {
  host: string;
  port: number;
  username: string;
  privateKeyPath?: string;
  passphrase?: string;
  password?: string;
  timeoutMs: number;
}

const RECONNECT_DELAY_MS = 2_000;

function entryKey(req: SshExecRequest): PoolKey {
  return `${req.host}:${req.port ?? 22}:${req.user}:${req.privateKeyPath ?? ''}`;
}

function execOnReady(client: Client, req: SshExecRequest): Promise<SshExecResult> {
  return new Promise<SshExecResult>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new TimeoutError(`ssh exec timed out after ${req.timeoutMs}ms`)));
    }, req.timeoutMs);

    const onAbort = (): void => {
      clearTimeout(timer);
      finish(() => reject(new TimeoutError('ssh exec aborted')));
    };
    req.signal?.addEventListener('abort', onAbort, { once: true });

    client.exec(req.command, (err, stream) => {
      if (err) {
        clearTimeout(timer);
        req.signal?.removeEventListener('abort', onAbort);
        finish(() => reject(new UnavailableError(`ssh exec failed: ${err.message}`)));
        return;
      }
      let stdout = '';
      let stderr = '';
      let code = 0;
      stream.on('close', (exitCode: number | null) => {
        clearTimeout(timer);
        req.signal?.removeEventListener('abort', onAbort);
        code = exitCode ?? 0;
        finish(() => resolve({ stdout, stderr, code }));
      });
      stream.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
      stream.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8'); });
    });
  });
}

export function createSshPool(): SshPool {
  const entries = new Map<PoolKey, PoolEntry>();

  function scheduleReconnect(key: PoolKey): void {
    setTimeout(() => {
      const entry = entries.get(key);
      if (!entry || entry.state === 'destroyed') return;
      entry.state = 'connecting';
      doConnect(key, entry);
    }, RECONNECT_DELAY_MS);
  }

  async function doConnect(key: PoolKey, entry: PoolEntry): Promise<void> {
    const { connectArgs } = entry;

    let privateKey: Buffer | undefined;
    if (connectArgs.privateKeyPath) {
      try {
        privateKey = await readFile(connectArgs.privateKeyPath);
      } catch {
        // Drain pending with auth error; don't retry — bad key path is config error
        const error = new UnauthorizedError(`ssh: cannot read key at ${connectArgs.privateKeyPath}`);
        entry.state = 'destroyed';
        entries.delete(key);
        drainPending(entry, error);
        return;
      }
    }

    entry.client.connect({
      host: connectArgs.host,
      port: connectArgs.port,
      username: connectArgs.username,
      privateKey,
      passphrase: connectArgs.passphrase || undefined,
      password: connectArgs.password || undefined,
      readyTimeout: connectArgs.timeoutMs,
    });
  }

  function drainPending(entry: PoolEntry, error: Error): void {
    const drained = entry.pending.splice(0);
    for (const p of drained) {
      p.reject(error);
    }
  }

  function getOrCreateEntry(req: SshExecRequest): PoolEntry {
    const key = entryKey(req);
    const existing = entries.get(key);
    if (existing) return existing;

    const client = new Client();
    const connectArgs: ConnectArgs = {
      host: req.host,
      port: req.port ?? 22,
      username: req.user,
      privateKeyPath: req.privateKeyPath,
      passphrase: req.passphrase,
      password: req.password,
      timeoutMs: req.timeoutMs,
    };

    const entry: PoolEntry = {
      client,
      state: 'connecting',
      pending: [],
      connectArgs,
    };
    entries.set(key, entry);

    client.on('ready', () => {
      entry.state = 'ready';
      // Drain any queued execs
      const drained = entry.pending.splice(0);
      for (const p of drained) {
        execOnReady(client, p.req).then(p.resolve, p.reject);
      }
    });

    client.on('error', (err: Error) => {
      if (entry.state === 'destroyed') return;
      const msg = err.message || String(err);
      const error = /auth|permission|denied/i.test(msg)
        ? new UnauthorizedError(`ssh auth failed: ${msg}`)
        : new UnavailableError(`ssh connect failed: ${msg}`);
      drainPending(entry, error);
      entry.state = 'reconnecting';
      scheduleReconnect(key);
    });

    client.on('close', () => {
      if (entry.state === 'destroyed') return;
      entry.state = 'reconnecting';
      scheduleReconnect(key);
    });

    // Kick off initial connection
    void doConnect(key, entry);

    return entry;
  }

  return {
    async exec(req: SshExecRequest): Promise<SshExecResult> {
      if (!req.host || !req.user) {
        throw new UnavailableError('ssh: host and user required');
      }

      const entry = getOrCreateEntry(req);

      if (entry.state === 'ready') {
        return execOnReady(entry.client, req);
      }

      // Queue until ready (or fail on next connection error)
      return new Promise<SshExecResult>((resolve, reject) => {
        entry.pending.push({ req, resolve, reject });
      });
    },

    destroy(): void {
      for (const [key, entry] of entries) {
        entry.state = 'destroyed';
        drainPending(entry, new UnavailableError('ssh pool destroyed'));
        try { entry.client.end(); } catch { /* ignore */ }
        entries.delete(key);
      }
    },
  };
}
