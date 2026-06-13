import { app, screen } from "electron";
import * as fs from "fs";
import * as path from "path";

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DesktopSettings {
  windowBounds?: WindowBounds;
  [key: string]: unknown;
}

const MIN_WIDTH = 900;
const MIN_HEIGHT = 600;
const WINDOW_BOUNDS_KEY = "windowBounds";

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

export function loadSettings(): DesktopSettings {
  let raw: string;
  try {
    raw = fs.readFileSync(settingsPath(), "utf8");
  } catch {
    return {};
  }
  try {
    return JSON.parse(raw) as DesktopSettings;
  } catch {
    // Quarantine a corrupt file rather than clobbering it, so a bad write is
    // recoverable instead of silently lost.
    try {
      fs.renameSync(settingsPath(), `${settingsPath()}.corrupt-${Date.now()}`);
    } catch {
      /* best-effort */
    }
    return {};
  }
}

export function saveSettings(data: DesktopSettings): void {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(data, null, 2));
  } catch {
    /* best-effort persistence */
  }
}

export function readSavedWindowBounds(): WindowBounds | undefined {
  const bounds = loadSettings()[WINDOW_BOUNDS_KEY] as WindowBounds | undefined;
  if (!bounds) return undefined;
  if (
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
  ) {
    return undefined;
  }
  return bounds;
}

export function clampBoundsToWorkArea(bounds: WindowBounds): WindowBounds {
  const display =
    screen.getDisplayMatching(bounds) ?? screen.getPrimaryDisplay();
  const wa = display.workArea;
  const width = Math.max(MIN_WIDTH, Math.min(bounds.width, wa.width));
  const height = Math.max(MIN_HEIGHT, Math.min(bounds.height, wa.height));
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(Math.max(v, lo), hi);
  return {
    width,
    height,
    x: clamp(bounds.x, wa.x, wa.x + wa.width - width),
    y: clamp(bounds.y, wa.y, wa.y + wa.height - height),
  };
}

export function saveWindowBounds(bounds: WindowBounds): void {
  saveSettings({ ...loadSettings(), [WINDOW_BOUNDS_KEY]: bounds });
}
