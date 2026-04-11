import test from "node:test";
import assert from "node:assert/strict";
import { issueCsrfToken, verifyCsrf } from "../middleware/csrf.js";

function createResponse() {
  const state = {
    cookieCall: undefined,
    statusCode: 200,
    jsonBody: undefined,
  };

  const res = {
    cookie(name, value, options) {
      state.cookieCall = { name, value, options };
      return this;
    },
    status(code) {
      state.statusCode = code;
      return this;
    },
    json(body) {
      state.jsonBody = body;
      return this;
    },
  };

  return { res, state };
}

test("issueCsrfToken sets csrf cookie and returns generated token", () => {
  const { res, state } = createResponse();
  const token = issueCsrfToken(res);

  assert.equal(typeof token, "string");
  assert.equal(token.length, 64);
  assert.equal(state.cookieCall.name, "csrfToken");
  assert.equal(state.cookieCall.value, token);
  assert.equal(state.cookieCall.options.httpOnly, false);
  assert.equal(state.cookieCall.options.path, "/");
});

test("issueCsrfToken sets secure strict cookie in production", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    const { res, state } = createResponse();
    issueCsrfToken(res);

    assert.equal(state.cookieCall.options.secure, true);
    assert.equal(state.cookieCall.options.sameSite, "strict");
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test("verifyCsrf bypasses GET/HEAD/OPTIONS", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    const req = { method, headers: {}, cookies: {} };
    const { res, state } = createResponse();
    let nextCalled = false;

    verifyCsrf(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(state.statusCode, 200);
  }
});

test("verifyCsrf blocks missing or mismatched tokens", () => {
  const scenarios = [
    {
      name: "missing header",
      req: { method: "POST", headers: {}, cookies: { csrfToken: "abc" } },
    },
    {
      name: "missing cookie",
      req: {
        method: "POST",
        headers: { "x-csrf-token": "abc" },
        cookies: {},
      },
    },
    {
      name: "mismatch",
      req: {
        method: "POST",
        headers: { "x-csrf-token": "abc" },
        cookies: { csrfToken: "xyz" },
      },
    },
  ];

  for (const scenario of scenarios) {
    const { res, state } = createResponse();
    let nextCalled = false;

    verifyCsrf(scenario.req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false, scenario.name);
    assert.equal(state.statusCode, 403, scenario.name);
    assert.deepEqual(
      state.jsonBody,
      { error: "Invalid or missing CSRF token" },
      scenario.name
    );
  }
});

test("verifyCsrf rejects when token lengths differ", () => {
  const req = {
    method: "POST",
    headers: { "x-csrf-token": "short" },
    cookies: { csrfToken: "this-is-a-longer-token" },
  };
  const { res, state } = createResponse();
  let nextCalled = false;

  verifyCsrf(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(state.statusCode, 403);
  assert.deepEqual(state.jsonBody, { error: "Invalid or missing CSRF token" });
});

test("verifyCsrf accepts matching tokens and calls next", () => {
  const token = "csrf-token-value";
  const req = {
    method: "POST",
    headers: { "x-csrf-token": token },
    cookies: { csrfToken: token },
  };
  const { res, state } = createResponse();
  let nextCalled = false;

  verifyCsrf(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(state.statusCode, 200);
});
