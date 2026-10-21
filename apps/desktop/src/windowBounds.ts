// Pure window-bounds helpers, kept free of Electron imports so they can be
// unit-tested with node:test. settings.ts wires them to `screen`.
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_WIDTH = 900;
export const MIN_HEIGHT = 600;

// settings.json is user-editable, so anything can be stored under the key.
export function parseWindowBounds(value: unknown): WindowBounds | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { x, y, width, height } = value as Record<string, unknown>;
  const nums = [x, y, width, height];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return undefined;
  }
  return {
    x: x as number,
    y: y as number,
    width: width as number,
    height: height as number,
  };
}

export function clampBounds(bounds: WindowBounds, wa: Rect): WindowBounds {
  const width = Math.max(MIN_WIDTH, Math.min(bounds.width, wa.width));
  const height = Math.max(MIN_HEIGHT, Math.min(bounds.height, wa.height));
  // When the minimum size exceeds the work area, the window can't fit: pin it
  // to the work area's top-left instead of letting hi < lo push it off-screen.
  const clamp = (v: number, lo: number, hi: number) =>
    hi < lo ? lo : Math.min(Math.max(v, lo), hi);
  return {
    width,
    height,
    x: clamp(bounds.x, wa.x, wa.x + wa.width - width),
    y: clamp(bounds.y, wa.y, wa.y + wa.height - height),
  };
}
