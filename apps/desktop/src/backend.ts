import { spawn, ChildProcess } from 'child_process';
import { app } from 'electron';
import * as path from 'path';
import * as http from 'http';

interface BackendHandle {
  readonly port: number;
  readonly host: string;
  readonly process: ChildProcess | null;
  stop(): Promise<void>;
}

const HEALTH_TIMEOUT_MS = 20000;
const HEALTH_POLL_INTERVAL_MS = 250;
const SHUTDOWN_GRACE_MS = 2000;

function resolveBackendEntry(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', 'dist', 'index.js');
  }
  return path.join(__dirname, '..', '..', 'backend', 'dist', 'index.js');
}

function waitForHealth(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(
        { host, port, path: '/meta/health', timeout: 1000 },
        (res) => {
          res.resume();
          if (res.statusCode === 200) {
            resolve();
            return;
          }
          scheduleNext();
        },
      );
      req.on('error', scheduleNext);
      req.on('timeout', () => {
        req.destroy();
        scheduleNext();
      });
    };

    const scheduleNext = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Backend health check timed out after ${timeoutMs}ms`));
        return;
      }
      setTimeout(attempt, HEALTH_POLL_INTERVAL_MS);
    };

    attempt();
  });
}

export async function startBackend(port: number): Promise<BackendHandle> {
  const host = '127.0.0.1';

  if (!app.isPackaged && process.env.WATCHMAN_SKIP_BACKEND_SPAWN === '1') {
    const externalPort = Number(process.env.BACKEND_V2_PORT || 3101);
    await waitForHealth(host, externalPort, HEALTH_TIMEOUT_MS);
    return {
      port: externalPort,
      host,
      process: null,
      async stop() {
        /* externally managed */
      },
    };
  }

  const entry = resolveBackendEntry();

  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      BACKEND_V2_PORT: String(port),
      BACKEND_V2_HOST: host,
      NODE_ENV: app.isPackaged ? 'production' : process.env.NODE_ENV || 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk) => {
    process.stdout.write(`[backend] ${chunk}`);
  });
  child.stderr?.on('data', (chunk) => {
    process.stderr.write(`[backend] ${chunk}`);
  });

  const exitPromise = new Promise<number | null>((resolve) => {
    child.once('exit', (code) => resolve(code));
  });

  try {
    await Promise.race([
      waitForHealth(host, port, HEALTH_TIMEOUT_MS),
      exitPromise.then((code) => {
        throw new Error(`Backend exited before becoming healthy (code=${code})`);
      }),
    ]);
  } catch (error) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
    throw error;
  }

  return {
    port,
    host,
    process: child,
    async stop() {
      if (child.killed || child.exitCode !== null) {
        return;
      }
      child.kill('SIGTERM');
      await Promise.race([
        exitPromise,
        new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_MS)),
      ]);
      if (child.exitCode === null && !child.killed) {
        child.kill('SIGKILL');
      }
    },
  };
}

export type { BackendHandle };
