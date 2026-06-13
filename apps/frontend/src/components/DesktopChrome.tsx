import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDesktopChrome, getWatchmanDesktop } from "@/hooks/useDesktopChrome";

/**
 * Headless component that activates native desktop chrome and routes native
 * menu / dock actions into the SPA router. Renders nothing; must live inside
 * the router so it can navigate. No-op in the browser build.
 */
export function DesktopChrome() {
  useDesktopChrome();
  const navigate = useNavigate();

  useEffect(() => {
    const desktop = getWatchmanDesktop();
    if (!desktop?.onMenuAction) return;
    return desktop.onMenuAction((message) => {
      if (
        message.action === "navigate" &&
        typeof message.payload === "string"
      ) {
        navigate(message.payload);
      }
    });
  }, [navigate]);

  return null;
}
