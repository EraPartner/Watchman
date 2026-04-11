import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  signToken,
  verifyToken,
  authenticateCredentials,
  requireAuth,
} from "../middleware/auth.js";

async function withEnv(overrides, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function createMockResponse() {
  const state = { statusCode: 200, jsonBody: undefined };
  const res = {
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

test("signToken throws when JWT_SECRET is missing", async () => {
  await withEnv({ JWT_SECRET: undefined }, () => {
    assert.throws(
      () => signToken({ sub: "admin" }),
      /JWT_SECRET not configured/
    );
  });
});

test("verifyToken returns decoded payload for valid token and null for invalid", async () => {
  await withEnv({ JWT_SECRET: "test-secret" }, () => {
    const token = signToken({ sub: "user-1" }, { expiresIn: "1h" });
    const decoded = verifyToken(token);

    assert.equal(decoded?.sub, "user-1");
    assert.equal(typeof decoded?.iat, "number");
    assert.equal(verifyToken("not-a-jwt"), null);
  });
});

test("authenticateCredentials succeeds for valid credentials and fails otherwise", async () => {
  const passwordHash = bcrypt.hashSync("correct-password", 10);

  await withEnv(
    {
      AUTH_USERNAME: "admin",
      AUTH_PASSWORD_HASH: passwordHash,
    },
    async () => {
      const ok = await authenticateCredentials("admin", "correct-password");
      assert.deepEqual(ok, { username: "admin", id: "admin" });

      const badUser = await authenticateCredentials(
        "wrong",
        "correct-password"
      );
      const badPass = await authenticateCredentials("admin", "bad-password");

      assert.equal(badUser, null);
      assert.equal(badPass, null);
    }
  );
});

test("authenticateCredentials rejects null/non-string/oversized input", async () => {
  await withEnv(
    { AUTH_USERNAME: "admin", AUTH_PASSWORD_HASH: "hash" },
    async () => {
      assert.equal(await authenticateCredentials(null, "x"), null);
      assert.equal(await authenticateCredentials("admin", null), null);
      assert.equal(await authenticateCredentials(123, "x"), null);
      assert.equal(await authenticateCredentials("admin", 123), null);
      assert.equal(await authenticateCredentials("a".repeat(129), "x"), null);
      assert.equal(
        await authenticateCredentials("admin", "p".repeat(257)),
        null
      );
    }
  );
});

test("authenticateCredentials returns null when bcrypt.compare throws", async () => {
  const originalCompare = bcrypt.compare;
  bcrypt.compare = async () => {
    throw new Error("compare failed");
  };

  try {
    await withEnv(
      { AUTH_USERNAME: "admin", AUTH_PASSWORD_HASH: "hash" },
      async () => {
        const result = await authenticateCredentials("admin", "password");
        assert.equal(result, null);
      }
    );
  } finally {
    bcrypt.compare = originalCompare;
  }
});

test("requireAuth returns 401 when no token is provided", () => {
  const { res, state } = createMockResponse();
  const req = { headers: {}, cookies: {} };
  let nextCalled = false;

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(state.statusCode, 401);
  assert.deepEqual(state.jsonBody, {
    error: "Unauthorized",
    message: "Authentication token required",
  });
});

test("requireAuth returns 401 when token is invalid", async () => {
  await withEnv({ JWT_SECRET: "test-secret" }, () => {
    const { res, state } = createMockResponse();
    const req = {
      headers: { authorization: "Bearer invalid-token" },
      cookies: {},
    };
    let nextCalled = false;

    requireAuth(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(state.statusCode, 401);
    assert.deepEqual(state.jsonBody, {
      error: "Unauthorized",
      message: "Invalid or expired token",
    });
  });
});

test("requireAuth calls next and attaches decoded user with tokenIssuedAt", async () => {
  await withEnv({ JWT_SECRET: "test-secret" }, () => {
    const token = signToken({ id: "admin", role: "user" }, { expiresIn: "1h" });
    const decoded = verifyToken(token);

    const { res } = createMockResponse();
    const req = {
      headers: { authorization: `Bearer ${token}` },
      cookies: {},
      user: undefined,
    };
    let nextCalled = false;

    requireAuth(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.user.id, "admin");
    assert.equal(req.user.role, "user");
    assert.equal(
      req.user.tokenIssuedAt,
      new Date(decoded.iat * 1000).toISOString()
    );
  });
});

test("requireAuth sets tokenIssuedAt undefined when token has no iat", async () => {
  await withEnv({ JWT_SECRET: "test-secret" }, () => {
    const token = jwt.sign(
      { id: "admin", role: "user" },
      process.env.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "1h",
        noTimestamp: true,
      }
    );

    const { res } = createMockResponse();
    const req = {
      headers: { authorization: `Bearer ${token}` },
      cookies: {},
      user: undefined,
    };
    let nextCalled = false;

    requireAuth(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.user.id, "admin");
    assert.equal(req.user.role, "user");
    assert.equal(req.user.tokenIssuedAt, undefined);
  });
});
