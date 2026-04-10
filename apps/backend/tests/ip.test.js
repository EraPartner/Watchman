import test from "node:test";
import assert from "node:assert/strict";
import { normalizeIp, getRequestIp, isLocalhostIp } from "../utils/ip.js";

test("normalizeIp returns unknown for empty/non-string and maps IPv4-mapped IPv6", () => {
  assert.equal(normalizeIp(undefined), "unknown");
  assert.equal(normalizeIp("  "), "unknown");
  assert.equal(normalizeIp("::ffff:127.0.0.1"), "127.0.0.1");
  assert.equal(normalizeIp("::ffff:192.168.1.50"), "192.168.1.50");
});

test("getRequestIp prefers req.ip then connection then socket", () => {
  assert.equal(
    getRequestIp({
      ip: "::ffff:10.0.0.5",
      connection: { remoteAddress: "10.0.0.6" },
      socket: { remoteAddress: "10.0.0.7" },
    }),
    "10.0.0.5"
  );

  assert.equal(
    getRequestIp({
      connection: { remoteAddress: "::ffff:10.0.0.6" },
      socket: { remoteAddress: "10.0.0.7" },
    }),
    "10.0.0.6"
  );

  assert.equal(
    getRequestIp({
      socket: { remoteAddress: "::1" },
    }),
    "::1"
  );
});

test("isLocalhostIp returns true only for localhost addresses", () => {
  assert.equal(isLocalhostIp("127.0.0.1"), true);
  assert.equal(isLocalhostIp("::1"), true);
  assert.equal(isLocalhostIp("localhost"), true);
  assert.equal(isLocalhostIp("::ffff:127.0.0.1"), true);
  assert.equal(isLocalhostIp("192.168.1.1"), false);
  assert.equal(isLocalhostIp(undefined), false);
});
