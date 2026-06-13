import { useEffect } from "react";
import { toast } from "sonner";

type Unsubscribe = () => void;

interface WatchmanDesktopApi {
  platform?: string;
  onFullScreenChange?: (cb: (isFullScreen: boolean) => void) => Unsubscribe;
  onBackendLost?: (cb: (payload: { message?: string }) => void) => Unsubscribe;
  onBackendRestored?: (cb: () => void) => Unsubscribe;
  onMenuAction?: (
    cb: (message: { action: string; payload?: unknown }) => void
  ) => Unsubscribe;
}

export function getWatchmanDesktop(): WatchmanDesktopApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { watchmanDesktop?: WatchmanDesktopApi })
    .watchmanDesktop;
}

/**
 * Wire up native desktop chrome behaviours, no-op in the browser build:
 * - tag <html> with data-desktop="macos" so the topbar can clear the inset
 *   traffic lights and become a drag region (see styles/desktop.css)
 * - track fullscreen so the inset is dropped while fullscreen
 * - surface backend lost/restored events from the main-process health watchdog
 */
export function useDesktopChrome(): void {
  useEffect(() => {
    const desktop = getWatchmanDesktop();
    if (!desktop) return;

    const root = document.documentElement;
    if (desktop.platform === "darwin") {
      root.dataset.desktop = "macos";
    }

    const unsubs: Unsubscribe[] = [];

    if (desktop.onFullScreenChange) {
      unsubs.push(
        desktop.onFullScreenChange((isFullScreen) => {
          if (isFullScreen) root.dataset.fullscreen = "true";
          else delete root.dataset.fullscreen;
        })
      );
    }

    let lostToastId: string | number | undefined;
    if (desktop.onBackendLost) {
      unsubs.push(
        desktop.onBackendLost(({ message }) => {
          lostToastId = toast.error(
            message || "Lost connection to the Watchman backend",
            { duration: Infinity }
          );
        })
      );
    }
    if (desktop.onBackendRestored) {
      unsubs.push(
        desktop.onBackendRestored(() => {
          if (lostToastId !== undefined) toast.dismiss(lostToastId);
          toast.success("Backend reconnected");
        })
      );
    }

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, []);
}
