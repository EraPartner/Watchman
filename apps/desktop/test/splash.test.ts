import { test } from "node:test";
import assert from "node:assert/strict";
import { splashDataUrl, toJsStringLiteral } from "../src/splash.ts";

test("splashDataUrl HTML-escapes the status text", () => {
  const html = decodeURIComponent(
    splashDataUrl("<img src=x onerror=alert(1)>").split(",")[1]
  );
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(!html.includes("<img"));
});

test("toJsStringLiteral evaluates back to the original text", () => {
  const text = "a\"b'c</script>\u2028\u2029\\n";
  const literal = toJsStringLiteral(text);
  assert.ok(!/[<>\/\u2028\u2029]/.test(literal));
  assert.equal(new Function(`return ${literal};`)(), text);
});
