import { spawn } from 'node:child_process';

export interface PingRequest {
  host: string;
  timeoutMs: number;
  count: number;
  signal?: AbortSignal;
}

export interface PingResult {
  success: boolean;
  avgMs?: number;
}

export interface PingProber {
  probe(req: PingRequest): Promise<PingResult>;
}

const ATTEMPTS: ReadonlyArray<{ cmd: string; args: (host: string, count: number) => string[] }> = [
  { cmd: 'ping', args: (h, c) => ['-c', String(c), '-4', h] },
  { cmd: 'ping', args: (h, c) => ['-c', String(c), h] },
  { cmd: 'ping6', args: (h, c) => ['-c', String(c), h] },
];

export function createPingProber(): PingProber {
  return {
    async probe({ host, timeoutMs, count, signal }) {
      for (const attempt of ATTEMPTS) {
        try {
          const out = await runOnce(attempt.cmd, attempt.args(host, count), timeoutMs, signal);
          const success =
            /0% packet loss|0\.0% packet loss|0 packets lost/.test(out) &&
            !/100% packet loss/.test(out);
          if (success) {
            const avgMs = parseAvg(out);
            return avgMs !== undefined ? { success: true, avgMs } : { success: true };
          }
        } catch {
          continue;
        }
      }
      return { success: false };
    },
  };
}

function runOnce(cmd: string, args: string[], timeoutMs: number, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], timeout: timeoutMs + 1500 });
    let stdout = '';
    const onAbort = () => child.kill('SIGKILL');
    if (signal) {
      if (signal.aborted) return reject(new Error('aborted'));
      signal.addEventListener('abort', onAbort, { once: true });
    }
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.on('close', (code) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      if (code === 0) resolve(stdout);
      else reject(new Error(`ping exit ${code}`));
    });
    child.on('error', (e) => reject(e));
  });
}

function parseAvg(stdout: string): number | undefined {
  const m = stdout.match(/=\s*[\d.]+\/([\d.]+)\/[\d.]+/);
  return m && m[1] ? Number(m[1]) : undefined;
}
