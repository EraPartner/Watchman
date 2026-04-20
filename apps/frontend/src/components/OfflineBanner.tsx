import { useCallback } from "react";
import { AlertTriangle, RefreshCw, Settings2 } from "lucide-react";
import { Button } from "./primitives";
import { useBackendReachable } from "../hooks/useBackendReachable";
import { getDesktopBridge } from "../lib/backendUrl";
import { logger } from "../lib/logger";

export function OfflineBanner() {
  const { reachable, apiUrl, probing, probe } = useBackendReachable();

  const handleRetry = useCallback(() => {
    void probe();
  }, [probe]);

  const handleChangeUrl = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge?.saveApiUrl || !bridge?.reload) return;
    try {
      await bridge.saveApiUrl("");
      await bridge.reload();
    } catch (error: unknown) {
      logger.error("[OFFLINE_BANNER] Failed to reset apiUrl", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  if (reachable) return null;

  const bridge = getDesktopBridge();
  const canChangeUrl = Boolean(bridge?.saveApiUrl && bridge?.reload);
  const target = apiUrl || "backend";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-s-3 px-s-4 py-s-2 bg-[var(--err-soft)] text-[var(--text-hi)] shadow-[inset_0_-1px_0_0_var(--hairline)] backdrop-blur"
    >
      <AlertTriangle className="h-4 w-4 text-[var(--crit)] shrink-0" />
      <span className="text-fs-label">
        Cannot reach backend at{" "}
        <span className="font-mono text-[var(--text-hi)]">{target}</span>.
      </span>
      <div className="flex items-center gap-s-2">
        <Button
          size="sm"
          variant="tonal"
          onClick={handleRetry}
          disabled={probing}
          className="gap-s-2"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${probing ? "animate-spin" : ""}`}
          />
          {probing ? "Checking…" : "Retry"}
        </Button>
        {canChangeUrl && (
          <Button
            size="sm"
            variant="accent"
            onClick={handleChangeUrl}
            className="gap-s-2"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Change URL
          </Button>
        )}
      </div>
    </div>
  );
}
