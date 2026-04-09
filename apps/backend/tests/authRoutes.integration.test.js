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
    error() {},
    warn() {},
    info() {},
    debug() {},
  };
}

async function withAuthApp({ authReturnToken }, run) {
  const app = express();
  app.use(express.json());

  registerAuthRoutes(app, {
    authLimiter: noopMiddleware,
    checkLockout: noopMiddleware,
    requireFields,
    authenticateCredentials: async (username, password) => {
      if (username === "admin" && password === "password123") {
        return { username: "admin", id: "admin-id" };
      }
      return null;
    },
    recordFailedLogin: async () => {},
    resetLoginAttempts: async () => {},
    signToken: () => "signed-jwt-token",
    issueCsrfToken: (res) => {
      const csrfToken = "csrf-token-value";
      res.cookie("csrfToken", csrfToken, {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
      });
      return csrfToken;
    },
    requireAuth: noopMiddleware,
    extractAuthToken: () => undefined,
    verifyToken: () => undefined,
    COOKIE_OPTIONS: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
    AUTH_RETURN_TOKEN: authReturnToken,
    logger: createLoggerStub(),
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
    await run({ baseUrl });
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
