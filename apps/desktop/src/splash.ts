import type { BrowserWindow } from "electron";

const APP_NAME = "Watchman";

// Lightweight, theme-matched boot splash shown the instant the window opens —
// before the backend has booted. The window navigates to the real frontend
// once the backend reports healthy.
export function splashDataUrl(status = "Starting…"): string {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100vh; }
  body {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 18px;
    background: radial-gradient(125% 125% at 50% 38%, #12161d 0%, #0a0c10 72%);
    color: #9aa4b2;
    font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased; user-select: none; cursor: default;
  }
  .ring {
    width: 30px; height: 30px; border-radius: 50%;
    border: 2.5px solid #f5b83d; border-top-color: transparent;
    opacity: 0.9; animation: spin 0.9s linear infinite;
    box-shadow: 0 0 18px -2px rgba(245, 184, 61, 0.5);
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .ring { animation: none; } }
  .name { color: #e9eef6; font-size: 15px; font-weight: 600; letter-spacing: 0.02em; }
  .status { font-size: 13px; font-variant-numeric: tabular-nums; }
</style></head><body>
  <div class="ring"></div>
  <div class="name">${APP_NAME}</div>
  <div class="status" id="splash-status">${status}</div>
</body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

// Update the splash status line in place (no-op once the window has navigated
// to the real frontend).
export function setSplashStatus(
  window: BrowserWindow | null,
  text: string
): void {
  if (!window || window.isDestroyed()) return;
  if (!window.webContents.getURL().startsWith("data:")) return;
  window.webContents
    .executeJavaScript(
      `(() => { const el = document.getElementById('splash-status'); if (el) el.textContent = ${JSON.stringify(text)}; })()`,
      true
    )
    .catch(() => {
      /* splash already navigated away */
    });
}
