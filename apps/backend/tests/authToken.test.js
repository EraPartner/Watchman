import test from "node:test";
import assert from "node:assert/strict";
import {
  extractBearerToken,
  parseCookieHeader,
  extractAuthToken,
} from "../utils/authToken.js";

test("extractBearerToken returns token only for valid Bearer header", () => {
  assert.equal(extractBearerToken(undefined), undefined);
  assert.equal(extractBearerToken("Basic abc"), undefined);
  assert.equal(extractBearerToken("Bearer "), undefined);
  assert.equal(extractBearerToken("Bearer token-123"), "token-123");
});

test("parseCookieHeader parses and decodes cookie pairs", () => {
  assert.deepEqual(parseCookieHeader(undefined), {});
  assert.deepEqual(parseCookieHeader(""), {});

  const parsed = parseCookieHeader(
    "token=abc123; session=hello%20world; bad=%E0%A4%A; flag=yes"
  );
  assert.equal(parsed.token, "abc123");
  assert.equal(parsed.session, "hello world");
  assert.equal(parsed.bad, "%E0%A4%A");
  assert.equal(parsed.flag, "yes");
});

test("extractAuthToken uses precedence: bearer > req.cookies > raw cookie header", () => {
  const fromBearer = extractAuthToken({
    headers: {
      authorization: "Bearer header-token",
      cookie: "token=cookie-token",
    },
    cookies: { token: "cookie-object-token" },
  });
  assert.equal(fromBearer, "header-token");

  const fromCookiesObject = extractAuthToken({
    headers: { cookie: "token=raw-cookie-token" },
    cookies: { token: "cookie-object-token" },
  });
  assert.equal(fromCookiesObject, "cookie-object-token");

  const fromRawCookie = extractAuthToken({
    headers: { cookie: "theme=dark; token=raw-cookie-token" },
    cookies: {},
  });
  assert.equal(fromRawCookie, "raw-cookie-token");

  assert.equal(extractAuthToken({ headers: {}, cookies: {} }), undefined);
});

test("extractAuthToken returns undefined for non-object request", () => {
  assert.equal(extractAuthToken(null), undefined);
  assert.equal(extractAuthToken(undefined), undefined);
});

test("parseCookieHeader ignores entries with empty cookie key", () => {
  const parsed = parseCookieHeader("=abc; token=mytoken; another=value");
  assert.equal(parsed.token, "mytoken");
  assert.equal(parsed.another, "value");
  assert.equal(parsed[""], undefined);
});
