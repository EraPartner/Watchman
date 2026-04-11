import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { registerAuthRoutes } from "../routes/authRoutes.js";
import { requireFields } from "../middleware/validation.js";

function noopMiddleware(_req, _res, next) {
  next();
}

function createLoggerStub() {
  return {
    calls: {
      error: [],
      warn: [],
      info: [],
      debug: [],
    },
    error(...args) {
      this.calls.error.push(args);
    },
    warn(...args) {
      this.calls.warn.push(args);
    },
    info(...args) {
      this.calls.info.push(args);
    },
    debug(...args) {
      this.calls.debug.push(args);
    },
  };
}

async function withAuthApp(options, run) {
  const {
    authReturnToken,
    authenticateCredentials = async (username, password) => {
      if (username === "admin" && password === "password123") {
        return { username: "admin", id: "admin-id" };
      }
      return null;
    },
    recordFailedLogin = async () => {},
    resetLoginAttempts = async () => {},
    extractAuthToken = () => undefined,
    verifyToken = () => undefined,
    requireAuth = noopMiddleware,
    logger = createLoggerStub(),
  } = options;

  const app = express();
  app.use(express.json());

  registerAuthRoutes(app, {
    authLimiter: noopMiddleware,
    checkLockout: noopMiddleware,
    requireFields,
    authenticateCredentials,
    recordFailedLogin,
    resetLoginAttempts,
    signToken: (...args) => {
      signToken.calls.push(args);
      return "signed-jwt-token";
    },
    issueCsrfToken: (res) => {
      const csrfToken = "csrf-token-value";
      res.cookie("csrfToken", csrfToken, {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
      });
      return csrfToken;
    },
    requireAuth,
    extractAuthToken,
    verifyToken,
    COOKIE_OPTIONS: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
    AUTH_RETURN_TOKEN: authReturnToken,
    logger,
  });

  const server = createServer(app);
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise((resolve) => server.close(resolve));
    throw new Error("Failed to resolve test server address");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run({ baseUrl, signTokenCalls: signToken.calls, logger });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

const signToken = { calls: [] };

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      username: "admin",
      password: "password123",
    }),
  });

  const body = await response.json();
  return { response, body };
}

test("POST /api/auth/login omits token when AUTH_RETURN_TOKEN=false", async () => {
  signToken.calls = [];
  await withAuthApp({ authReturnToken: false }, async ({ baseUrl }) => {
    const { response, body } = await login(baseUrl);
    const setCookie = response.headers.get("set-cookie") || "";

    assert.equal(response.status, 200);
    assert.equal(body.message, "Login successful");
    assert.deepEqual(body.user, { username: "admin", id: "admin-id" });
    assert.equal(Object.hasOwn(body, "token"), false);
    assert.match(setCookie, /token=signed-jwt-token/);
  });
});

test("POST /api/auth/login includes token when AUTH_RETURN_TOKEN=true", async () => {
  signToken.calls = [];
  await withAuthApp({ authReturnToken: true }, async ({ baseUrl }) => {
    const { response, body } = await login(baseUrl);
    const setCookie = response.headers.get("set-cookie") || "";

    assert.equal(response.status, 200);
    assert.equal(body.message, "Login successful");
    assert.deepEqual(body.user, { username: "admin", id: "admin-id" });
    assert.equal(body.token, "signed-jwt-token");
    assert.match(setCookie, /token=signed-jwt-token/);
  });
});

test("POST /api/auth/login signs token with aligned 8h expiry options", async () => {
  signToken.calls = [];
  await withAuthApp(
    { authReturnToken: false },
    async ({ baseUrl, signTokenCalls }) => {
      const { response } = await login(baseUrl);
      assert.equal(response.status, 200);

      assert.equal(signTokenCalls.length, 1);
      const [payload, options] = signTokenCalls[0];
      assert.equal(payload.sub, "admin-id");
      assert.equal(payload.username, "admin");
      assert.deepEqual(options, { expiresIn: "8h" });
    }
  );
});

test("POST /api/auth/login returns 401 and records failed login with normalized IP", async () => {
  signToken.calls = [];
  const failedLogins = [];

  await withAuthApp(
    {
      authReturnToken: false,
      recordFailedLogin: async (...args) => {
        failedLogins.push(args);
      },
    },
    async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ username: "bad", password: "creds" }),
      });
      const body = await response.json();

      assert.equal(response.status, 401);
      assert.deepEqual(body, { message: "Invalid credentials" });
      assert.equal(failedLogins.length, 1);
      assert.equal(failedLogins[0][0], "bad");
      assert.equal(failedLogins[0][1], "127.0.0.1");
    }
  );
});

test("POST /api/auth/login returns 500 when authentication throws and logs error", async () => {
  signToken.calls = [];

  await withAuthApp(
    {
      authReturnToken: false,
      authenticateCredentials: async () => {
        throw new Error("auth backend unavailable");
      },
    },
    async ({ baseUrl, logger }) => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ username: "admin", password: "password123" }),
      });
      const body = await response.json();

      assert.equal(response.status, 500);
      assert.deepEqual(body, { message: "Internal server error" });
      assert.equal(logger.calls.error.length, 1);
      assert.equal(logger.calls.error[0][0], "Login error");
      assert.deepEqual(logger.calls.error[0][1], {
        error: "auth backend unavailable",
      });
    }
  );
});

test("POST /api/auth/logout clears auth and csrf cookies", async () => {
  signToken.calls = [];

  await withAuthApp({ authReturnToken: false }, async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
    });
    const body = await response.json();
    const setCookie = response.headers.get("set-cookie") || "";

    assert.equal(response.status, 200);
    assert.deepEqual(body, { success: true });
    assert.match(setCookie, /token=/);
    assert.match(setCookie, /csrfToken=/);
  });
});

test("GET /api/auth/me returns authenticated=false without token", async () => {
  await withAuthApp({ authReturnToken: false }, async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/auth/me`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { authenticated: false });
  });
});

test("GET /api/auth/me returns authenticated=false for invalid decoded token", async () => {
  await withAuthApp(
    {
      authReturnToken: false,
      extractAuthToken: () => "token",
      verifyToken: () => undefined,
    },
    async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/api/auth/me`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(body, { authenticated: false });
    }
  );
});

test("GET /api/auth/me falls back to sub when username is empty", async () => {
  await withAuthApp(
    {
      authReturnToken: false,
      extractAuthToken: () => "token",
      verifyToken: () => ({ sub: "user-123", username: "" }),
    },
    async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/api/auth/me`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(body, {
        authenticated: true,
        user: { id: "user-123", username: "user-123" },
      });
    }
  );
});

test("GET /api/auth/me handles non-object decoded token safely", async () => {
  await withAuthApp(
    {
      authReturnToken: false,
      extractAuthToken: () => "token",
      verifyToken: () => "not-an-object",
    },
    async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/api/auth/me`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(body, {
        authenticated: true,
        user: {},
      });
    }
  );
});
