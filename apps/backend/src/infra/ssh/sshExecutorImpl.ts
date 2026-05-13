import { readFile } from 'node:fs/promises';
import { Client } from 'ssh2';
import { TimeoutError, UnavailableError, UnauthorizedError } from '../../core/errors.js';
import type { SshExecRequest, SshExecResult, SshExecutor } from './sshExecutor.js';

export function createSshExecutor(): SshExecutor {
  return {
    async exec(req: SshExecRequest): Promise<SshExecResult> {
      if (!req.host || !req.user) {
        throw new UnavailableError('ssh: host and user required');
      }

      let privateKey: Buffer | undefined;
      if (req.privateKeyPath) {
        try {
          privateKey = await readFile(req.privateKeyPath);
        } catch (e) {
          throw new UnauthorizedError(`ssh: cannot read key at ${req.privateKeyPath}`);
        }
      }

      return await new Promise<SshExecResult>((resolve, reject) => {
        const client = new Client();
        let settled = false;
        const finish = (fn: () => void): void => {
          if (settled) return;
          settled = true;
          try { client.end(); } catch { /* ignore */ }
          fn();
        };

        const timer = setTimeout(() => {
          finish(() => reject(new TimeoutError(`ssh exec timed out after ${req.timeoutMs}ms`)));
        }, req.timeoutMs);

        const onAbort = (): void => {
          finish(() => reject(new TimeoutError('ssh exec aborted')));
        };
        req.signal?.addEventListener('abort', onAbort, { once: true });

        client.on('ready', () => {
          client.exec(req.command, (err: Error | undefined, stream: NodeJS.EventEmitter & { stderr: NodeJS.EventEmitter }) => {
            if (err) {
              clearTimeout(timer);
              finish(() => reject(new UnavailableError(`ssh exec failed: ${err.message}`)));
              return;
            }
            let stdout = '';
            let stderr = '';
            let code = 0;
            stream.on('close', (exitCode: number | null) => {
              clearTimeout(timer);
              code = exitCode ?? 0;
              finish(() => resolve({ stdout, stderr, code }));
            });
            stream.on('data', (d: Buffer) => {
              stdout += d.toString('utf8');
            });
            stream.stderr.on('data', (d: Buffer) => {
              stderr += d.toString('utf8');
            });
          });
        });

        client.on('error', (err: Error) => {
          clearTimeout(timer);
          const msg = err.message || String(err);
          if (/auth|permission|denied/i.test(msg)) {
            finish(() => reject(new UnauthorizedError(`ssh auth failed: ${msg}`)));
          } else {
            finish(() => reject(new UnavailableError(`ssh connect failed: ${msg}`)));
          }
        });

        client.connect({
          host: req.host,
          port: req.port,
          username: req.user,
          readyTimeout: req.timeoutMs,
          ...(privateKey ? { privateKey } : {}),
          ...(req.passphrase ? { passphrase: req.passphrase } : {}),
          ...(req.password ? { password: req.password } : {}),
        });
      });
    },
  };
}
