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

/**
 * `new URL(...).hostname` keeps the brackets of an IPv6 literal ("[fe80::1]"),
 * which ping rejects as an unknown host.
 */
export function pingTarget(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

export function createPingProber(): PingProber {
  return {
    async probe({ host: rawHost, timeoutMs, count, signal }) {
      const host = pingTarget(rawHost);
      const n = pingCountFor(count, timeoutMs);
      for (const attempt of ATTEMPTS) {
        try {
          const out = await runOnce(attempt.cmd, attempt.args(host, n), timeoutMs, signal);
          if (repliedToPing(out)) {
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
      if (signal?.aborted) reject(new Error('aborted'));
      else if (code === 0 || hasReplyLine(stdout)) resolve(stdout);
      else reject(new Error(`ping exit ${code}`));
    });
    child.on('error', (e) => reject(e));
  });
}

/**
 * runOnce resolves on exit 0, which iputils and BSD/macOS ping both use for
 * "at least one reply received", or when a run killed at the timeout already
 * printed a reply line. Any reply counts as reachable; only a summary
 * reporting 100% loss is treated as unreachable.
 */
export function repliedToPing(stdout: string): boolean {
  return !/(^|[^\d.])100(\.0+)?% packet loss/m.test(stdout);
}

/**
 * ping sends one echo per second by default; shorter intervals need root on
 * some platforms, so no -i flag is passed and `count` echoes take about
 * count-1 seconds. Clamp the count to what
 * fits in the timeout: otherwise a responsive host is killed mid-run (e.g.
 * pingCount 8 with a 5 s timeout) and reported unreachable.
 */
export function pingCountFor(count: number, timeoutMs: number): number {
  const fits = Math.max(1, Math.floor(timeoutMs / 1000));
  return Math.max(1, Math.min(Math.floor(count) || 1, fits));
}

const REPLY_LINE = /bytes from .*time[=<]\s*([\d.]+)\s*ms/g;

/** True when stdout has at least one echo reply line ("64 bytes from ..."),
 *  so a run that was killed before its summary still counts as reachable. */
export function hasReplyLine(stdout: string): boolean {
  return /bytes from .*time[=<]/.test(stdout);
}

export function parseAvg(stdout: string): number | undefined {
  const m = stdout.match(/=\s*[\d.]+\/([\d.]+)\/[\d.]+/);
  if (m && m[1]) return Number(m[1]);
  // no summary (the run was cut short): average the per-reply times
  const times = [...stdout.matchAll(REPLY_LINE)].map((r) => Number(r[1]));
  if (times.length === 0) return undefined;
  return times.reduce((a, b) => a + b, 0) / times.length;
}
