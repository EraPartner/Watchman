import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampBounds,
  parseWindowBounds,
  MIN_HEIGHT,
  MIN_WIDTH,
} from "../src/windowBounds.ts";

test("parseWindowBounds accepts finite numbers", () => {
  assert.deepEqual(
    parseWindowBounds({ x: 10, y: 20, width: 1200, height: 800, extra: 1 }),
    { x: 10, y: 20, width: 1200, height: 800 }
  );
});

test("parseWindowBounds rejects non-objects (regression: null threw)", () => {
  for (const value of [null, undefined, 42, "x", true]) {
    assert.equal(parseWindowBounds(value), undefined);
  }
});

test("parseWindowBounds rejects missing or non-finite fields", () => {
  assert.equal(parseWindowBounds({ x: 0, y: 0, width: 900 }), undefined);
  assert.equal(
    parseWindowBounds({ x: "0", y: 0, width: 900, height: 600 }),
    undefined
  );
  assert.equal(
    parseWindowBounds({ x: NaN, y: 0, width: 900, height: 600 }),
    undefined
  );
});

test("clampBounds keeps a window inside a large work area", () => {
  const wa = { x: 0, y: 25, width: 1920, height: 1055 };
  assert.deepEqual(
    clampBounds({ x: 5000, y: -300, width: 1440, height: 900 }, wa),
    { x: 480, y: 25, width: 1440, height: 900 }
  );
});

test("clampBounds pins to the top-left when the work area is smaller than the minimum (regression: went off-screen)", () => {
  const wa = { x: 100, y: 50, width: 800, height: 500 };
  const out = clampBounds({ x: 300, y: 200, width: 1440, height: 900 }, wa);
  assert.equal(out.width, MIN_WIDTH);
  assert.equal(out.height, MIN_HEIGHT);
  assert.equal(out.x, 100);
  assert.equal(out.y, 50);
});
