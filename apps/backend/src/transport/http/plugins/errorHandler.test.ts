import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { errorHandlerPlugin } from "./errorHandler.js";
import { UnavailableError } from "../../../core/errors.js";

async function makeApp() {
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.post("/echo", async (req) => ({ data: req.body }));
  app.get("/boom", async () => {
    throw new Error("secret detail");
  });
  app.get("/down", async () => {
    throw new UnavailableError("service down");
  });
  return app;
}

describe("errorHandlerPlugin", () => {
  it("maps a malformed JSON body to 400 VALIDATION, not INTERNAL", async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/echo",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
    await app.close();
  });

  it("maps an unsupported media type to 415 VALIDATION", async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/echo",
      headers: { "content-type": "application/x-unknown" },
      payload: "x",
    });
    expect(res.statusCode).toBe(415);
    expect(res.json().error.code).toBe("VALIDATION");
    await app.close();
  });

  it("hides the message of an unexpected error behind 500 INTERNAL", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: { code: "INTERNAL", message: "internal error" },
    });
    await app.close();
  });

  it("passes domain errors through with their code and status", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/down" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      error: { code: "UNAVAILABLE", message: "service down" },
    });
    await app.close();
  });
});
