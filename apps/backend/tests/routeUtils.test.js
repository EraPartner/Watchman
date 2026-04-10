import test from "node:test";
import assert from "node:assert/strict";
import { getErrorMessage, getServiceContext } from "../routes/routeUtils.js";

test("getErrorMessage returns message for Error instances", () => {
  const error = new Error("boom");
  assert.equal(getErrorMessage(error), "boom");
});

test("getErrorMessage stringifies non-Error values", () => {
  assert.equal(getErrorMessage("bad"), "bad");
  assert.equal(getErrorMessage(42), "42");
  assert.equal(getErrorMessage(undefined), "undefined");
});

test("getServiceContext returns service when manager is valid", () => {
  const manager = {
    getService(name) {
      return { name };
    },
  };

  const result = getServiceContext(() => manager, "adguard");

  assert.equal(result.serviceManager, manager);
  assert.deepEqual(result.service, { name: "adguard" });
});

test("getServiceContext returns undefined service for invalid manager", () => {
  const result = getServiceContext(() => ({}), "adguard");

  assert.deepEqual(result, {
    serviceManager: {},
    service: undefined,
  });
});
