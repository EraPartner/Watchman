import { spawn, ChildProcess } from "child_process";
import { app } from "electron";
import * as path from "path";
import * as http from "http";
import { stopChild } from "./childStop";

interface BackendHandle {
  readonly port: number;
  readonly host: string;
  readonly process: ChildProcess | null;
  stop(): Promise<void>;
}

const HEALTH_TIMEOUT_MS = 20000;
const HEALTH_POLL_INTERVAL_MS = 250;
const SHUTDOWN_GRACE_MS = 2000;

// Child spawned but not yet healthy. startBackend() has not returned a handle
// for it, so a quit during startup has to stop it through stopPendingBackend().
let pendingStop: (() => Promise<void>) | null = null;

export function stopPendingBackend(): Promise<void> | null {
  return pendingStop ? pendingStop() : null;
}

function resolveBackendEntry(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "backend", "dist", "index.js");
  }
  return path.join(__dirname, "..", "..", "backend", "dist", "index.js");
}

function waitForHealth(
  host: string,
  port: number,
  timeoutMs: number
): Promise<void> {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(
        { host, port, path: "/meta/health", timeout: 1000 },
        (res) => {
          res.resume();
          if (res.statusCode === 200) {
            resolve();
            return;
          }
          scheduleNext();
        }
      );
      req.on("error", scheduleNext);
      req.on("timeout", () => {
        req.destroy();
        scheduleNext();
      });
    };

    const scheduleNext = () => {
      if (Date.now() - start > timeoutMs) {
        reject(
          new Error(`Backend health check timed out after ${timeoutMs}ms`)
        );
        return;
      }
      setTimeout(attempt, HEALTH_POLL_INTERVAL_MS);
    };

    attempt();
  });
}

// One-shot liveness probe used by the post-startup health watchdog.
export function pingHealth(
  host: string,
  port: number,
  timeoutMs = 2000
): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { host, port, path: "/meta/health", timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

export async function startBackend(
  port: number,
  dataDir: string,
  onLog?: (chunk: string) => void
): Promise<BackendHandle> {
  const host = "127.0.0.1";

  if (!app.isPackaged && process.env.WATCHMAN_SKIP_BACKEND_SPAWN === "1") {
    const externalPort = Number(process.env.BACKEND_V2_PORT || 3001);
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
    // The backend reads .env.local/.env from its working directory. Pin it to
    // the app's user-data folder so they don't come from wherever the app
    // happened to be launched.
    cwd: app.getPath("userData"),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      BACKEND_V2_PORT: String(port),
      BACKEND_V2_HOST: host,
      DATA_DIR: dataDir,
      NODE_ENV: app.isPackaged
        ? "production"
        : process.env.NODE_ENV || "development",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (chunk) => {
    process.stdout.write(`[backend] ${chunk}`);
    onLog?.(String(chunk));
  });
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(`[backend] ${chunk}`);
    onLog?.(String(chunk));
  });

  const exitPromise = new Promise<number | null>((resolve) => {
    child.once("exit", (code) => resolve(code));
  });

  const stop = () => stopChild(child, exitPromise, SHUTDOWN_GRACE_MS);
  pendingStop = stop;
  try {
    await Promise.race([
      waitForHealth(host, port, HEALTH_TIMEOUT_MS),
      exitPromise.then((code) => {
        throw new Error(
          `Backend exited before becoming healthy (code=${code})`
        );
      }),
    ]);
  } catch (error) {
    await stop();
    throw error;
  } finally {
    pendingStop = null;
  }

  return {
    port,
    host,
    process: child,
    stop,
  };
}

export type { BackendHandle };
