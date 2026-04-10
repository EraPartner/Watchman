import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  logger,
  requestIdMiddleware,
  requestLogger,
} from "../middleware/logger.js";

test("logger.redact masks sensitive values and handles non-string messages", () => {
  const message =
    "password=abc123 token=mytoken secret: shhh authorization: Bearer supersecret user=user@example.com";
  const redacted = logger.redact(message);

  assert.match(redacted, /password=.*\[REDACTED\]/i);
  assert.match(redacted, /token=.*\[REDACTED\]/i);
  assert.match(redacted, /secret:\s*\[REDACTED\]/i);
  assert.match(redacted, /authorization:\s*\[REDACTED\]/i);

  const numberRedacted = logger.redact(12345);
  assert.equal(numberRedacted, "12345");
});

test("requestIdMiddleware sets request id and response header", () => {
  const req = { headers: {} };
  const headers = {};
  const res = {
    setHeader(name, value) {
      headers[name] = value;
    },
  };

  let calledNext = false;
  requestIdMiddleware(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, true);
  assert.equal(typeof req.requestId, "string");
  assert.equal(req.requestId.length > 0, true);
  assert.equal(headers["X-Request-ID"], req.requestId);
});

test("requestLogger logs warn for 4xx and error for 5xx responses", () => {
  const originalWarn = logger.warn;
  const originalError = logger.error;
  const originalDebug = logger.debug;

  const warnCalls = [];
  const errorCalls = [];

  logger.warn = (...args) => {
    warnCalls.push(args);
  };
  logger.error = (...args) => {
    errorCalls.push(args);
  };
  logger.debug = () => {};

  try {
    const req = {
      requestId: "req-1",
      method: "GET",
      path: "/api/test",
      ip: "127.0.0.1",
      headers: { "user-agent": "node-test" },
    };

    const res4xx = new EventEmitter();
    res4xx.statusCode = 404;
    let nextCalled = false;

    requestLogger(req, res4xx, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    res4xx.emit("finish");

    const res5xx = new EventEmitter();
    res5xx.statusCode = 503;
    requestLogger(req, res5xx, () => {});
    res5xx.emit("finish");

    assert.equal(warnCalls.length, 1);
    assert.equal(warnCalls[0][0], "Request completed");
    assert.equal(warnCalls[0][1].statusCode, 404);

    assert.equal(errorCalls.length, 1);
    assert.equal(errorCalls[0][0], "Request completed");
    assert.equal(errorCalls[0][1].statusCode, 503);
  } finally {
    logger.warn = originalWarn;
    logger.error = originalError;
    logger.debug = originalDebug;
  }
});

test("logger.format redacts message and preserves expected metadata fields", () => {
  const formatted = logger.format("info", "token=abc123", {
    requestId: "req-123",
    userId: "user-1",
    ip: "127.0.0.1",
    path: "/api/test",
    method: "GET",
    duration: "12ms",
    statusCode: 200,
    ignored: "not-in-output",
  });

  const parsed = JSON.parse(formatted);
  assert.equal(parsed.level, "INFO");
  assert.match(parsed.message, /token=.*\[REDACTED\]/i);
  assert.equal(parsed.requestId, "req-123");
  assert.equal(parsed.userId, "user-1");
  assert.equal(parsed.path, "/api/test");
  assert.equal(parsed.method, "GET");
  assert.equal(parsed.duration, "12ms");
  assert.equal(parsed.statusCode, 200);
  assert.equal("ignored" in parsed, false);
});

test("logger.shouldLog handles level thresholds and unknown levels", () => {
  const originalLevel = logger.level;
  try {
    logger.level = "warn";
    assert.equal(logger.shouldLog("error"), true);
    assert.equal(logger.shouldLog("warn"), true);
    assert.equal(logger.shouldLog("info"), false);
    assert.equal(logger.shouldLog("debug"), false);
    assert.equal(logger.shouldLog("unknown"), false);
  } finally {
    logger.level = originalLevel;
  }
});

test("logger.write respects enabled and shouldLog guards", () => {
  const originalEnabled = logger.enabled;
  const originalShouldLog = logger.shouldLog;
  const originalConsoleLog = console.log;
  const calls = [];

  console.log = (...args) => calls.push(args);

  try {
    logger.enabled = false;
    logger.write("info", "should not write");
    assert.equal(calls.length, 0);

    logger.enabled = true;
    logger.shouldLog = () => false;
    logger.write("info", "still should not write");
    assert.equal(calls.length, 0);

    logger.shouldLog = originalShouldLog;
    logger.write("unknown", "message type");
    assert.equal(calls.length, 0);

    logger.write("error", "now writes");
    assert.equal(calls.length, 1);
    assert.match(String(calls[0][0]), /"level":"ERROR"/);
  } finally {
    logger.enabled = originalEnabled;
    logger.shouldLog = originalShouldLog;
    console.log = originalConsoleLog;
  }
});

test("requestLogger logs debug path for successful 2xx response", () => {
  const originalDebug = logger.debug;
  const calls = [];
  logger.debug = (...args) => calls.push(args);

  try {
    const req = {
      requestId: "req-ok",
      method: "GET",
      path: "/api/ok",
      ip: "127.0.0.1",
      headers: { "user-agent": "node-test" },
    };

    const res = new EventEmitter();
    res.statusCode = 200;

    requestLogger(req, res, () => {});
    res.emit("finish");

    assert.equal(calls.length, 2);
    assert.equal(calls[0][0], "Incoming request");
    assert.equal(calls[1][0], "Request completed");
    assert.equal(calls[1][1].statusCode, 200);
  } finally {
    logger.debug = originalDebug;
  }
});
