import { useCallback, useEffect, useRef, useState } from "react";
import { getBackendUrl } from "../lib/backendUrl";

const POLL_INTERVAL_MS = 10_000;
const PROBE_TIMEOUT_MS = 3_000;
const FAILURE_THRESHOLD = 3;

export interface BackendReachableState {
  reachable: boolean;
  apiUrl: string;
  probing: boolean;
  probe: () => Promise<void>;
}

async function probeHealth(base: string): Promise<boolean> {
  if (!base) return false;
  try {
    const response = await fetch(`${base}/meta/health`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function useBackendReachable(): BackendReachableState {
  const apiUrl = getBackendUrl();
  const [reachable, setReachable] = useState(true);
  const [probing, setProbing] = useState(false);
  const failuresRef = useRef(0);
  const cancelledRef = useRef(false);

  const probe = useCallback(async () => {
    if (!apiUrl) return;
    setProbing(true);
    const ok = await probeHealth(apiUrl);
    if (cancelledRef.current) return;
    setProbing(false);

    if (ok) {
      failuresRef.current = 0;
      setReachable(true);
      return;
    }

    failuresRef.current += 1;
    if (failuresRef.current >= FAILURE_THRESHOLD) {
      setReachable(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    cancelledRef.current = false;
    if (!apiUrl) {
      setReachable(true);
      return () => {
        cancelledRef.current = true;
      };
    }

    void probe();
    const interval = window.setInterval(() => {
      void probe();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelledRef.current = true;
      window.clearInterval(interval);
    };
  }, [apiUrl, probe]);

  return { reachable, apiUrl, probing, probe };
}
