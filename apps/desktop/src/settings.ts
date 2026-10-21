import { app, screen } from "electron";
import * as fs from "fs";
import * as path from "path";
import {
  clampBounds,
  parseWindowBounds,
  type WindowBounds,
} from "./windowBounds";

export type { WindowBounds };

interface DesktopSettings {
  windowBounds?: WindowBounds;
  [key: string]: unknown;
}

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
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
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
  // Valid JSON that isn't an object (`null`, a number, an array) used to throw
  // in readSavedWindowBounds and stop the window from being created.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  return parsed as DesktopSettings;
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
  return parseWindowBounds(loadSettings()[WINDOW_BOUNDS_KEY]);
}

export function clampBoundsToWorkArea(bounds: WindowBounds): WindowBounds {
  const display =
    screen.getDisplayMatching(bounds) ?? screen.getPrimaryDisplay();
  return clampBounds(bounds, display.workArea);
}

export function saveWindowBounds(bounds: WindowBounds): void {
  saveSettings({ ...loadSettings(), [WINDOW_BOUNDS_KEY]: bounds });
}
