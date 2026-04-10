import test from "node:test";
import assert from "node:assert/strict";
import {
  requireFields,
  requireBoolean,
  requireString,
  isValidServiceName,
  validateQueryParams,
} from "../middleware/validation.js";

function createRes() {
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

test("requireFields throws for invalid configuration", () => {
  assert.throws(() => requireFields(), /non-empty array/);
  assert.throws(() => requireFields([]), /non-empty array/);
  assert.throws(() => requireFields("username"), /non-empty array/);
});

test("requireFields returns 500 when config contains non-string item", () => {
  const middleware = requireFields(["username", 42]);
  const { res, state } = createRes();
  let calledNext = false;

  middleware({ body: { username: "admin" } }, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, false);
  assert.equal(state.statusCode, 500);
  assert.deepEqual(state.jsonBody, { error: "Server validation error" });
});

test("requireFields returns 400 when required field is missing", () => {
  const middleware = requireFields(["username", "password"]);
  const { res, state } = createRes();

  middleware({ body: { username: "admin" } }, res, () => {});

  assert.equal(state.statusCode, 400);
  assert.deepEqual(state.jsonBody, {
    error: "Missing required field: password",
    field: "password",
  });
});

test("requireFields calls next when all fields are present", () => {
  const middleware = requireFields(["username", "password"]);
  const { res, state } = createRes();
  let calledNext = false;

  middleware({ body: { username: "admin", password: "secret" } }, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, true);
  assert.equal(state.statusCode, 200);
});

test("requireBoolean throws when field argument is invalid", () => {
  assert.throws(() => requireBoolean(1), /string field name/);
});

test("requireBoolean returns 400 with field and received type", () => {
  const middleware = requireBoolean("enabled");
  const { res, state } = createRes();

  middleware({ body: { enabled: "true" } }, res, () => {});

  assert.equal(state.statusCode, 400);
  assert.deepEqual(state.jsonBody, {
    error: "Field 'enabled' must be a boolean value (true or false)",
    field: "enabled",
    received: "string",
  });
});

test("requireBoolean calls next for boolean value", () => {
  const middleware = requireBoolean("enabled");
  let calledNext = false;

  middleware({ body: { enabled: false } }, createRes().res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, true);
});

test("requireString throws for invalid field argument", () => {
  assert.throws(() => requireString(123), /string field name/);
});

test("requireString throws for invalid length constraints", () => {
  assert.throws(
    () => requireString("name", { minLength: -1 }),
    /Invalid length/
  );
  assert.throws(
    () => requireString("name", { maxLength: 0 }),
    /Invalid length/
  );
  assert.throws(
    () => requireString("name", { minLength: 10, maxLength: 5 }),
    /Invalid length/
  );
});

test("requireString rejects non-string values", () => {
  const middleware = requireString("name");
  const { res, state } = createRes();

  middleware({ body: { name: 42 } }, res, () => {});

  assert.equal(state.statusCode, 400);
  assert.deepEqual(state.jsonBody, {
    error: "Field 'name' must be a string",
    field: "name",
    received: "number",
  });
});

test("requireString rejects empty trimmed value when allowEmpty is false", () => {
  const middleware = requireString("name", { allowEmpty: false });
  const { res, state } = createRes();

  middleware({ body: { name: "   " } }, res, () => {});

  assert.equal(state.statusCode, 400);
  assert.deepEqual(state.jsonBody, {
    error: "Field 'name' cannot be empty",
    field: "name",
  });
});

test("requireString enforces min and max length", () => {
  const minMiddleware = requireString("name", { minLength: 3, maxLength: 6 });
  const minState = createRes();

  minMiddleware({ body: { name: "ab" } }, minState.res, () => {});
  assert.equal(minState.state.statusCode, 400);
  assert.equal(minState.state.jsonBody.actualLength, 2);

  const maxMiddleware = requireString("name", { minLength: 3, maxLength: 6 });
  const maxState = createRes();

  maxMiddleware({ body: { name: "toolong" } }, maxState.res, () => {});
  assert.equal(maxState.state.statusCode, 400);
  assert.equal(maxState.state.jsonBody.actualLength, 7);
});

test("requireString rejects null bytes", () => {
  const middleware = requireString("name");
  const { res, state } = createRes();

  middleware({ body: { name: "ab\0cd" } }, res, () => {});

  assert.equal(state.statusCode, 400);
  assert.deepEqual(state.jsonBody, {
    error: "Field 'name' contains invalid characters",
    field: "name",
  });
});

test("requireString rejects values that do not match pattern", () => {
  const middleware = requireString("name", { pattern: /^[a-z]+$/ });
  const { res, state } = createRes();

  middleware({ body: { name: "John123" } }, res, () => {});

  assert.equal(state.statusCode, 400);
  assert.deepEqual(state.jsonBody, {
    error: "Field 'name' format is invalid",
    field: "name",
  });
});

test("requireString calls next for valid value", () => {
  const middleware = requireString("name", {
    minLength: 3,
    maxLength: 10,
    pattern: /^[a-z]+$/,
  });
  let calledNext = false;

  middleware({ body: { name: "alice" } }, createRes().res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, true);
});

test("isValidServiceName handles valid and invalid edge cases", () => {
  assert.equal(isValidServiceName("service_1-name"), true);
  assert.equal(isValidServiceName(""), false);
  assert.equal(isValidServiceName("name with spaces"), false);
  assert.equal(isValidServiceName("name!"), false);
  assert.equal(isValidServiceName("a".repeat(64)), true);
  assert.equal(isValidServiceName("a".repeat(65)), false);
  assert.equal(isValidServiceName(123), false);
});

test("validateQueryParams accepts empty/non-object query values", () => {
  assert.equal(validateQueryParams(undefined, ["a"]), true);
  assert.equal(validateQueryParams(null, ["a"]), true);
  assert.equal(validateQueryParams("not-object", ["a"]), true);
});

test("validateQueryParams rejects unknown keys and ignores allowed key casing", () => {
  assert.equal(
    validateQueryParams({ PAGE: "1", sort: "asc" }, ["page", "SORT"]),
    true
  );
  assert.equal(
    validateQueryParams({ page: "1", bad: "x" }, ["page", "sort"]),
    false
  );
});
