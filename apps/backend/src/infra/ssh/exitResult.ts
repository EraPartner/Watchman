import { UnavailableError } from '../../core/errors.js';
import type { SshExecResult } from './sshExecutor.js';

/**
 * ssh2 closes a channel with `(code)` after an exit-status, `(null, signal)`
 * when the command was killed by a signal, and with no arguments when the
 * connection dropped before any exit status arrived. Only the first is a
 * complete result; the others carry truncated output.
 */
export function exitResult(
  stdout: string,
  stderr: string,
  exitCode: number | null | undefined,
  signalName: string | undefined,
): SshExecResult | Error {
  if (typeof exitCode === 'number') return { stdout, stderr, code: exitCode };
  return new UnavailableError(
    signalName
      ? `ssh command killed by signal ${signalName}`
      : 'ssh connection closed before the command exited',
  );
}
