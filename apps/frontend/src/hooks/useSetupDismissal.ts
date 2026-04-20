import { useCallback, useEffect, useState } from "react";

const KEY = "watchman.setupDismissed";

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function useSetupDismissal() {
  const [dismissed, setDismissed] = useState<boolean>(read);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === KEY) setDismissed(read());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* noop */
    }
    setDismissed(true);
  }, []);

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* noop */
    }
    setDismissed(false);
  }, []);

  return { dismissed, dismiss, reset };
}
