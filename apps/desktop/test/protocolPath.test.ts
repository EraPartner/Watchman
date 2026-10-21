import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeRequestPath } from "../src/protocolPath.ts";

test("maps the root to index.html", () => {
  assert.equal(decodeRequestPath("/"), "/index.html");
  assert.equal(decodeRequestPath(""), "/index.html");
});

test("decodes percent escapes", () => {
  assert.equal(decodeRequestPath("/assets/a%20b.js"), "/assets/a b.js");
});

test("returns undefined for a malformed escape (regression: threw)", () => {
  assert.equal(decodeRequestPath("/assets/%E0%A4%A"), undefined);
  assert.equal(decodeRequestPath("/%"), undefined);
});
