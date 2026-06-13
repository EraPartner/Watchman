import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  session,
  shell,
} from "electron";
import * as path from "path";
import { getFreePort } from "./freePort";
import { startBackend, pingHealth, BackendHandle } from "./backend";
import {
  registerFrontendScheme,
  handleFrontendProtocol,
  FRONTEND_ENTRY_URL,
} from "./frontendProtocol";
import { splashDataUrl, setSplashStatus } from "./splash";
import { initLogFile, appendLog, openLogs } from "./logs";
import { setupApplicationMenu, setupDockMenu } from "./menu";
import {
  readSavedWindowBounds,
  clampBoundsToWorkArea,
  saveWindowBounds,
  type WindowBounds,
} from "./settings";

let mainWindow: BrowserWindow | null = null;
let backend: BackendHandle | null = null;

// Backend connection details handed to the renderer's preload synchronously
// (see ipcMain 'watchman:get-config'). Empty until the backend is healthy —
// the splash document does not need them.
let backendConfig: { apiUrl: string; wsUrl: string } = {
  apiUrl: "",
  wsUrl: "",
};

const isMac = process.platform === "darwin";
const MIN_WIDTH = 900;
const MIN_HEIGHT = 600;
const WINDOW_BOUNDS_SAVE_DEBOUNCE_MS = 500;
const WATCHDOG_INTERVAL_MS = 10_000;
const WATCHDOG_FAILURE_THRESHOLD = 3;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

registerFrontendScheme();

// The frontend is served from the privileged `watchman://` origin, which is
// distinct from the backend's `http://127.0.0.1:<port>` origin, so the renderer
// must be told where the API lives. Delivering it over a synchronous IPC reply
// (rather than window `additionalArguments`) means it resolves for any document
// the window loads — splash, app, or error page — independent of when the
// window was created relative to the backend coming up.
ipcMain.on("watchman:get-config", (event) => {
  event.returnValue = {
    ...backendConfig,
    platform: process.platform,
    isDesktop: true,
  };
});

ipcMain.handle("recovery:open-logs", () => openLogs());

ipcMain.handle("recovery:retry", async () => {
  if (backend) {
    await loadFrontend();
    startWatchdog();
    return { success: true };
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    await mainWindow.loadURL(splashDataUrl("Retrying…"));
  }
  try {
    await attemptBackendStart();
    return { success: true };
  } catch (error) {
    loadErrorPage(errorMessage(error));
    return { success: false, error: errorMessage(error) };
  }
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  bootstrap();
}

function resolveFrontendRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "frontend", "dist");
  }
  return path.join(__dirname, "..", "..", "frontend", "dist");
}

// dist/ and assets/ are siblings in both dev (apps/desktop/) and the packaged
// asar, so the relative hop is the same in both.
function resolveErrorPage(): string {
  return path.join(__dirname, "..", "assets", "error.html");
}

function notify(body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title: "Watchman", body }).show();
  }
}

let windowBoundsSaveTimer: NodeJS.Timeout | null = null;
function scheduleWindowBoundsSave(): void {
  if (windowBoundsSaveTimer) clearTimeout(windowBoundsSaveTimer);
  windowBoundsSaveTimer = setTimeout(() => {
    windowBoundsSaveTimer = null;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    // getNormalBounds: a maximized/fullscreen window records its restored frame.
    saveWindowBounds(mainWindow.getNormalBounds() as WindowBounds);
  }, WINDOW_BOUNDS_SAVE_DEBOUNCE_MS);
}

function createWindow(): void {
  const saved = readSavedWindowBounds();

  mainWindow = new BrowserWindow({
    ...(saved ? clampBoundsToWorkArea(saved) : { width: 1440, height: 900 }),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: "Watchman",
    backgroundColor: "#0a0c10",
    show: false,
    // macOS-native chrome: frameless content with inset traffic lights and
    // under-window vibrancy. The renderer adds a drag region + left inset to
    // its topbar when it detects a darwin desktop (see useDesktopChrome).
    ...(isMac
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 18, y: 18 },
          vibrancy: "under-window" as const,
          visualEffectState: "followWindow" as const,
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Keep the OS window title fixed as "Watchman" regardless of the page's
  // <title> (the frontend's is "lan-watchman"); it surfaces in the Window menu
  // and Mission Control even with the hidden title bar.
  mainWindow.webContents.on("page-title-updated", (event) => {
    event.preventDefault();
  });

  // External links open in the system browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Navigation allow-list: keep the window pinned to the frontend, the local
  // backend, and bundled files. Anything else (an external link that slipped
  // past the open-handler) is bounced to the system browser.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const target = new URL(url);
      const allowed =
        target.protocol === "watchman:" ||
        target.protocol === "file:" ||
        target.hostname === "127.0.0.1" ||
        target.hostname === "localhost";
      if (!allowed) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });

  if (isMac) {
    mainWindow.on("enter-full-screen", () => {
      mainWindow?.webContents.send("window:fullscreen", true);
    });
    mainWindow.on("leave-full-screen", () => {
      mainWindow?.webContents.send("window:fullscreen", false);
    });
  }

  mainWindow.on("resize", scheduleWindowBoundsSave);
  mainWindow.on("move", scheduleWindowBoundsSave);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Show the splash immediately; bootstrap() swaps in the real frontend once
  // the backend is healthy.
  void mainWindow.loadURL(splashDataUrl());
}

async function loadFrontend(): Promise<void> {
  if (!mainWindow) return;
  const devUrl = process.env.WATCHMAN_DEV_URL;
  if (!app.isPackaged && devUrl) {
    await mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWindow.loadURL(FRONTEND_ENTRY_URL);
  }
}

function loadErrorPage(message: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    dialog.showErrorBox("Watchman failed to start", message);
    return;
  }
  mainWindow
    .loadFile(resolveErrorPage(), { query: { msg: message } })
    .catch(() => {
      dialog.showErrorBox("Watchman failed to start", message);
    });
}

let starting = false;
async function attemptBackendStart(): Promise<void> {
  if (starting) return;
  starting = true;
  try {
    setSplashStatus(mainWindow, "Starting backend…");
    const port = await getFreePort();
    const dataDir = path.join(app.getPath("userData"), "data");
    backend = await startBackend(port, dataDir, appendLog);
    backendConfig = {
      apiUrl: `http://${backend.host}:${backend.port}`,
      wsUrl: `ws://${backend.host}:${backend.port}/ws`,
    };
    setSplashStatus(mainWindow, "Loading…");
    await loadFrontend();
    startWatchdog();
  } finally {
    starting = false;
  }
}

// ── Health watchdog ───────────────────────────────────────────────────────────
// After the app loads, poll the backend periodically. On a run of failures,
// tell the renderer (toast) and fire a native notification; on recovery, tell
// the renderer to clear it.
let watchdogTimer: NodeJS.Timeout | null = null;
let watchdogFailures = 0;
let backendLostReported = false;

function stopWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
  watchdogFailures = 0;
  backendLostReported = false;
}

function startWatchdog(): void {
  stopWatchdog();
  watchdogTimer = setInterval(async () => {
    if (!backend) return;
    const healthy = await pingHealth(backend.host, backend.port, 3000);
    const live = mainWindow && !mainWindow.isDestroyed();
    if (healthy) {
      if (backendLostReported && live) {
        mainWindow!.webContents.send("backend:restored");
      }
      watchdogFailures = 0;
      backendLostReported = false;
      return;
    }
    watchdogFailures += 1;
    if (
      !backendLostReported &&
      watchdogFailures >= WATCHDOG_FAILURE_THRESHOLD
    ) {
      backendLostReported = true;
      const message = "Lost connection to the Watchman backend";
      if (live) mainWindow!.webContents.send("backend:lost", { message });
      notify(message);
    }
  }, WATCHDOG_INTERVAL_MS);
  watchdogTimer.unref?.();
}

async function bootstrap(): Promise<void> {
  await app.whenReady();

  initLogFile();

  // The renderer never needs camera/mic/geolocation/etc. — deny every web
  // permission request outright. Native notifications are fired from the main
  // process, so this does not affect them.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) =>
    cb(false)
  );

  handleFrontendProtocol(resolveFrontendRoot());

  setupApplicationMenu(() => mainWindow);
  setupDockMenu(() => mainWindow);

  createWindow();

  try {
    await attemptBackendStart();
  } catch (error) {
    loadErrorPage(errorMessage(error));
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      if (backend) {
        loadFrontend()
          .then(() => startWatchdog())
          .catch((error) => {
            dialog.showErrorBox("Failed to reopen window", errorMessage(error));
          });
      }
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

let shuttingDown = false;
app.on("before-quit", (event) => {
  if (shuttingDown || !backend) {
    return;
  }
  shuttingDown = true;
  event.preventDefault();
  stopWatchdog();
  backend
    .stop()
    .catch(() => {
      /* best-effort shutdown */
    })
    .finally(() => {
      backend = null;
      app.quit();
    });
});
