import net from 'node:net';

export interface TcpProbeRequest {
  host: string;
  port: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface TcpProber {
  probe(req: TcpProbeRequest): Promise<boolean>;
}

export function createTcpProber(): TcpProber {
  return {
    probe({ host, port, timeoutMs, signal }) {
      return new Promise<boolean>((resolve) => {
        const socket = new net.Socket();
        let settled = false;
        const done = (ok: boolean) => {
          if (settled) return;
          settled = true;
          socket.destroy();
          if (signal) signal.removeEventListener('abort', onAbort);
          resolve(ok);
        };
        const onAbort = () => done(false);
        socket.setTimeout(timeoutMs);
        socket.once('connect', () => done(true));
        socket.once('timeout', () => done(false));
        socket.once('error', () => done(false));
        if (signal) {
          if (signal.aborted) return done(false);
          signal.addEventListener('abort', onAbort, { once: true });
        }
        socket.connect(port, host);
      });
    },
  };
}
