import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedNavigation, originOf } from "../src/navigation.ts";

const policy = {
  backendOrigin: "http://127.0.0.1:51234",
  devOrigin: "http://localhost:5173",
};

test("allows the app scheme, the backend origin and the dev origin", () => {
  assert.equal(isAllowedNavigation("watchman://app/settings", policy), true);
  assert.equal(
    isAllowedNavigation("http://127.0.0.1:51234/meta/health", policy),
    true
  );
  assert.equal(isAllowedNavigation("http://localhost:5173/", policy), true);
});

test("rejects file: URLs (regression: any file: URL was allowed)", () => {
  assert.equal(isAllowedNavigation("file:///etc/passwd", policy), false);
  assert.equal(isAllowedNavigation("file:///Users/me/x.html", {}), false);
});

test("rejects other loopback ports (regression: any port was allowed)", () => {
  assert.equal(isAllowedNavigation("http://127.0.0.1:8080/", policy), false);
  assert.equal(isAllowedNavigation("http://localhost:3000/", policy), false);
  assert.equal(isAllowedNavigation("https://127.0.0.1:51234/", policy), false);
});

test("rejects external and unparseable URLs", () => {
  assert.equal(isAllowedNavigation("https://example.com/", policy), false);
  assert.equal(isAllowedNavigation("not a url", policy), false);
});

test("allows only the app scheme before the backend is known", () => {
  assert.equal(isAllowedNavigation("watchman://app/", {}), true);
  assert.equal(isAllowedNavigation("http://127.0.0.1:51234/", {}), false);
});

test("originOf", () => {
  assert.equal(originOf("http://127.0.0.1:51234"), "http://127.0.0.1:51234");
  assert.equal(originOf("http://localhost:5173/x?y"), "http://localhost:5173");
  assert.equal(originOf(""), undefined);
  assert.equal(originOf(undefined), undefined);
  assert.equal(originOf("nope"), undefined);
  assert.equal(originOf("file:///tmp/x"), undefined);
});
