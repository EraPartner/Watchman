import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { requestTimeout } from "../middleware/requestTimeout.js";

function createResponse() {
  const res = new EventEmitter();
  const state = { statusCode: 200, jsonBody: undefined };
  res.headersSent = false;
  res.status = (code) => {
    state.statusCode = code;
    return res;
  };
  res.json = (body) => {
    state.jsonBody = body;
    return res;
  };
  return { res, state };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("requestTimeout bypasses /health route", async () => {
  const middleware = requestTimeout({ timeout: 10 });
  const req = { path: "/health", method: "GET", ip: "127.0.0.1" };
  const { res, state } = createResponse();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  await wait(25);

  assert.equal(nextCalled, true);
  assert.equal(req.requestAbortController, undefined);
  assert.equal(state.statusCode, 200);
  assert.equal(state.jsonBody, undefined);
});

test("requestTimeout sends 503 JSON and aborts request signal", async () => {
  const middleware = requestTimeout({
    timeout: 15,
    timeoutMessage: "Too slow",
  });
  const req = { path: "/api/test", method: "GET", ip: "127.0.0.1" };
  const { res, state } = createResponse();

  middleware(req, res, () => {});

  await wait(40);

  assert.equal(state.statusCode, 503);
  assert.deepEqual(state.jsonBody, {
    error: "Too slow",
    code: "TIMEOUT",
    timeout: 15,
  });
  assert.equal(req.requestAbortSignal.aborted, true);
  assert.match(String(req.requestAbortSignal.reason?.message), /timed out/i);
});

test("requestTimeout clears timer when response finishes", async () => {
  const middleware = requestTimeout({ timeout: 20 });
  const req = { path: "/api/ok", method: "GET", ip: "127.0.0.1" };
  const { res, state } = createResponse();

  middleware(req, res, () => {});
  res.emit("finish");

  await wait(45);

  assert.equal(state.statusCode, 200);
  assert.equal(state.jsonBody, undefined);
  assert.equal(req.requestAbortSignal.aborted, false);
});

test("requestTimeout aborts with client disconnected when closed before finish", () => {
  const middleware = requestTimeout({ timeout: 50 });
  const req = { path: "/api/disconnect", method: "GET", ip: "127.0.0.1" };
  const { res } = createResponse();

  middleware(req, res, () => {});
  res.emit("close");

  assert.equal(req.requestAbortSignal.aborted, true);
  assert.equal(req.requestAbortSignal.reason?.message, "Client disconnected");
});
