import test from "node:test";
import assert from "node:assert/strict";
import { responseSizeLimit } from "../middleware/responseSizeLimit.js";

function createMockResponse({ headersSent = false } = {}) {
  const state = {
    writes: [],
    ends: [],
    headers: {},
    socketDestroyCalls: 0,
  };

  const response = {
    headersSent,
    statusCode: 200,
    socket: {
      destroyed: false,
      destroy() {
        this.destroyed = true;
        state.socketDestroyCalls += 1;
      },
    },
    setHeader(name, value) {
      state.headers[String(name).toLowerCase()] = String(value);
    },
    write(chunk, encoding, callback) {
      state.writes.push({ chunk, encoding });
      if (typeof encoding === "function") {
        encoding();
      }
      if (typeof callback === "function") {
        callback();
      }
      return true;
    },
    end(chunk, encoding, callback) {
      state.ends.push({ chunk, encoding });
      if (typeof encoding === "function") {
        encoding();
      }
      if (typeof callback === "function") {
        callback();
      }
      return response;
    },
  };

  return { response, state };
}

function createMockRequest(path = "/api/test") {
  return {
    method: "GET",
    path,
    ip: "127.0.0.1",
  };
}

test("responseSizeLimit bypasses health route without wrapping response", () => {
  const middleware = responseSizeLimit({ maxSize: 16 });
  const req = createMockRequest("/health");
  const { response } = createMockResponse();
  const originalWrite = response.write;
  const originalEnd = response.end;

  let nextCalled = false;
  middleware(req, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(response.write, originalWrite);
  assert.equal(response.end, originalEnd);
});

test("responseSizeLimit allows responses at or under configured limit", () => {
  const middleware = responseSizeLimit({ maxSize: 12 });
  const req = createMockRequest();
  const { response, state } = createMockResponse();

  middleware(req, response, () => {});

  const writeResult = response.write("123456", "utf8");
  const endResult = response.end("123456", "utf8");

  assert.equal(writeResult, true);
  assert.equal(endResult, response);
  assert.equal(response.statusCode, 200);
  assert.equal(state.writes.length, 1);
  assert.equal(state.ends.length, 1);
  assert.equal(state.socketDestroyCalls, 0);
});

test("responseSizeLimit sends 413 JSON when limit exceeded before headers sent", () => {
  const middleware = responseSizeLimit({
    maxSize: 10,
    errorMessage: "Custom too large message",
  });
  const req = createMockRequest();
  const { response, state } = createMockResponse({ headersSent: false });

  middleware(req, response, () => {});

  const writeResult = response.write("12345678901", "utf8");

  assert.equal(writeResult, false);
  assert.equal(response.statusCode, 413);
  assert.equal(
    state.headers["content-type"],
    "application/json; charset=utf-8"
  );
  assert.equal(state.ends.length, 1);
  assert.deepEqual(JSON.parse(String(state.ends[0].chunk)), {
    error: "Custom too large message",
    code: "RESPONSE_TOO_LARGE",
  });
  assert.equal(state.socketDestroyCalls, 0);
});

test("responseSizeLimit destroys socket when limit exceeded after headers sent", () => {
  const middleware = responseSizeLimit({ maxSize: 5 });
  const req = createMockRequest();
  const { response, state } = createMockResponse({ headersSent: true });

  middleware(req, response, () => {});

  const endResult = response.end("123456", "utf8");

  assert.equal(endResult, response);
  assert.equal(state.ends.length, 0);
  assert.equal(state.socketDestroyCalls, 1);
  assert.equal(response.socket.destroyed, true);
});
