import { contextBridge, ipcRenderer } from "electron";

interface DesktopConfig {
  apiUrl: string;
  wsUrl: string;
  platform: NodeJS.Platform;
  isDesktop: boolean;
}

// Synchronous so window.__WATCHMAN__ is populated before the frontend's first
// module evaluates (getBackendUrl reads it synchronously). Runs once per
// document load, so a reload/error-page → frontend transition always sees the
// current backend config.
const config = ipcRenderer.sendSync("watchman:get-config") as DesktopConfig;

contextBridge.exposeInMainWorld("__WATCHMAN__", {
  apiUrl: config?.apiUrl ?? "",
  wsUrl: config?.wsUrl ?? "",
  platform: config?.platform ?? process.platform,
  isDesktop: true,
});

// Richer desktop surface for native integrations. Subscription helpers return
// an unsubscribe function so React effects can clean up.
contextBridge.exposeInMainWorld("watchmanDesktop", {
  platform: config?.platform ?? process.platform,

  /** Native fullscreen enter/leave — the renderer drops the traffic-light inset in fullscreen. */
  onFullScreenChange: (cb: (isFullScreen: boolean) => void) => {
    const listener = (_event: unknown, isFullScreen: boolean) =>
      cb(isFullScreen);
    ipcRenderer.on("window:fullscreen", listener);
    return () => ipcRenderer.removeListener("window:fullscreen", listener);
  },

  /** Native menu / dock actions: { action: string, payload?: unknown }. */
  onMenuAction: (
    cb: (message: { action: string; payload?: unknown }) => void
  ) => {
    const listener = (
      _event: unknown,
      message: { action: string; payload?: unknown }
    ) => cb(message);
    ipcRenderer.on("menu:action", listener);
    return () => ipcRenderer.removeListener("menu:action", listener);
  },

  /** Backend health watchdog: fired when the supervised backend stops responding. */
  onBackendLost: (cb: (payload: { message?: string }) => void) => {
    const listener = (_event: unknown, payload: { message?: string }) =>
      cb(payload);
    ipcRenderer.on("backend:lost", listener);
    return () => ipcRenderer.removeListener("backend:lost", listener);
  },

  /** Fired when the backend recovers after a `backend:lost`. */
  onBackendRestored: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("backend:restored", listener);
    return () => ipcRenderer.removeListener("backend:restored", listener);
  },

  /** Startup-recovery controls used by the error page. */
  retry: () => ipcRenderer.invoke("recovery:retry"),
  openLogs: () => ipcRenderer.invoke("recovery:open-logs"),
});
