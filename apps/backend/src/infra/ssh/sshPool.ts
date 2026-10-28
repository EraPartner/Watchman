import { readFile } from 'node:fs/promises';
import { Client } from 'ssh2';
import { TimeoutError, UnavailableError, UnauthorizedError } from '../../core/errors.js';
import { expandHome } from '../../core/expandHome.js';
import type { SshExecRequest, SshExecResult, SshExecutor } from './sshExecutor.js';
import { exitResult } from './exitResult.js';

export interface SshPool extends SshExecutor {
  /** Close all persistent connections and release resources. */
  destroy(): void;
}

type PoolKey = string;
type PoolState = 'connecting' | 'ready' | 'destroyed';

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
  privateKeyPath: string | undefined;
  passphrase: string | undefined;
  password: string | undefined;
  timeoutMs: number;
}

function entryKey(req: SshExecRequest): PoolKey {
  return `${req.host}:${req.port ?? 22}:${req.user}:${req.privateKeyPath ?? ''}`;
}

function sameCredentials(args: ConnectArgs, req: SshExecRequest): boolean {
  return args.password === req.password && args.passphrase === req.passphrase;
}

interface ClosableChannel {
  close(): unknown;
}

/** Close a channel we no longer wait on; it would otherwise stay open on the pooled connection. */
function closeChannel(channel: ClosableChannel | undefined): void {
  try { channel?.close(); } catch { /* already closed */ }
}

function execOnReady(client: Client, req: SshExecRequest): Promise<SshExecResult> {
  return new Promise<SshExecResult>((resolve, reject) => {
    let settled = false;
    let channel: ClosableChannel | undefined;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.signal?.removeEventListener('abort', onAbort);
      fn();
    };

    // A hung remote command keeps its channel open; sshd's MaxSessions
    // (default 10) would then block every later exec on this connection.
    const timer = setTimeout(() => {
      finish(() => reject(new TimeoutError(`ssh exec timed out after ${req.timeoutMs}ms`)));
      closeChannel(channel);
    }, req.timeoutMs);

    const onAbort = (): void => {
      finish(() => reject(new TimeoutError('ssh exec aborted')));
      closeChannel(channel);
    };
    if (req.signal?.aborted) {
      onAbort();
      return;
    }
    req.signal?.addEventListener('abort', onAbort, { once: true });

    client.exec(req.command, (err, stream) => {
      if (err) {
        finish(() => reject(new UnavailableError(`ssh exec failed: ${err.message}`)));
        return;
      }
      if (settled) {
        // the channel opened after the timeout or abort already fired
        closeChannel(stream);
        return;
      }
      channel = stream;
      // collect raw bytes so multi-byte UTF-8 split across chunks decodes intact
      const out: Buffer[] = [];
      const errOut: Buffer[] = [];
      stream.on('close', (exitCode?: number | null, signalName?: string) => {
        const result = exitResult(
          Buffer.concat(out).toString('utf8'),
          Buffer.concat(errOut).toString('utf8'),
          exitCode,
          signalName,
        );
        finish(() => (result instanceof Error ? reject(result) : resolve(result)));
      });
      stream.on('data', (d: Buffer) => { out.push(d); });
      stream.stderr.on('data', (d: Buffer) => { errOut.push(d); });
    });
  });
}

/**
 * Persistent SSH connections keyed by host/port/user/key. A connection is
 * opened on first use and reused while it stays up. When it fails or closes,
 * queued execs are rejected and the entry is dropped; the next exec opens a
 * fresh connection (with the credentials of that request), so a host that is
 * down or no longer configured is not reconnected in the background.
 */
export function createSshPool(): SshPool {
  const entries = new Map<PoolKey, PoolEntry>();

  async function doConnect(key: PoolKey, entry: PoolEntry): Promise<void> {
    const { connectArgs } = entry;

    let privateKey: Buffer | undefined;
    if (connectArgs.privateKeyPath) {
      try {
        privateKey = await readFile(expandHome(connectArgs.privateKeyPath));
      } catch {
        // Drain pending with auth error — bad key path is a config error
        retire(key, entry, new UnauthorizedError(`ssh: cannot read key at ${connectArgs.privateKeyPath}`));
        return;
      }
    }
    if (entry.state === 'destroyed') return;

    entry.client.connect({
      host: connectArgs.host,
      port: connectArgs.port,
      username: connectArgs.username,
      readyTimeout: connectArgs.timeoutMs,
      ...(privateKey ? { privateKey } : {}),
      ...(connectArgs.passphrase ? { passphrase: connectArgs.passphrase } : {}),
      ...(connectArgs.password ? { password: connectArgs.password } : {}),
    });
  }

  function drainPending(entry: PoolEntry, error: Error): void {
    const drained = entry.pending.splice(0);
    for (const p of drained) {
      p.reject(error);
    }
  }

  /** Take an entry out of service: reject its queue, close it, forget it. */
  function retire(key: PoolKey, entry: PoolEntry, error: Error): void {
    if (entry.state === 'destroyed') return;
    entry.state = 'destroyed';
    if (entries.get(key) === entry) entries.delete(key);
    drainPending(entry, error);
    try { entry.client.end(); } catch { /* ignore */ }
  }

  function getOrCreateEntry(req: SshExecRequest): PoolEntry {
    const key = entryKey(req);
    const existing = entries.get(key);
    if (existing && sameCredentials(existing.connectArgs, req)) return existing;
    if (existing) {
      // credentials were edited: never keep serving from the old login
      retire(key, existing, new UnavailableError('ssh credentials changed'));
    }

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
      if (entry.state === 'destroyed') return;
      entry.state = 'ready';
      // Drain any queued execs
      const drained = entry.pending.splice(0);
      for (const p of drained) {
        execOnReady(client, p.req).then(p.resolve, p.reject);
      }
    });

    // ssh2 emits 'error' and then 'close' for one failure; retire() is idempotent
    client.on('error', (err: Error) => {
      const msg = err.message || String(err);
      const error = /auth|permission|denied/i.test(msg)
        ? new UnauthorizedError(`ssh auth failed: ${msg}`)
        : new UnavailableError(`ssh connect failed: ${msg}`);
      retire(key, entry, error);
    });

    client.on('close', () => {
      retire(key, entry, new UnavailableError('ssh connection closed'));
    });

    // Kick off initial connection
    void doConnect(key, entry);

    return entry;
  }

  /** Queue until the connection is ready, still bounded by the request's own timeout and signal. */
  function enqueue(entry: PoolEntry, req: SshExecRequest): Promise<SshExecResult> {
    return new Promise<SshExecResult>((resolve, reject) => {
      const leave = (): boolean => {
        clearTimeout(timer);
        req.signal?.removeEventListener('abort', onAbort);
        const idx = entry.pending.indexOf(pending);
        if (idx < 0) return false;
        entry.pending.splice(idx, 1);
        return true;
      };
      const timer = setTimeout(() => {
        if (leave()) reject(new TimeoutError(`ssh connect timed out after ${req.timeoutMs}ms`));
      }, req.timeoutMs);
      const onAbort = (): void => {
        if (leave()) reject(new TimeoutError('ssh exec aborted'));
      };
      const pending: PendingExec = {
        req,
        resolve: (r) => { leave(); resolve(r); },
        reject: (e) => { leave(); reject(e); },
      };
      entry.pending.push(pending);
      if (req.signal?.aborted) onAbort();
      else req.signal?.addEventListener('abort', onAbort, { once: true });
    });
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

      return enqueue(entry, req);
    },

    destroy(): void {
      for (const [key, entry] of entries) {
        retire(key, entry, new UnavailableError('ssh pool destroyed'));
      }
    },
  };
}
