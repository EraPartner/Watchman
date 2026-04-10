// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { csrfManager } from "./csrf";
import { logger } from "./logger";

describe("CSRFManager", () => {
  const originalCookieDescriptor = Object.getOwnPropertyDescriptor(
    Document.prototype,
    "cookie"
  );

  afterEach(() => {
    vi.restoreAllMocks();
    csrfManager.configure({
      cookieName: "csrfToken",
      headerName: "x-csrf-token",
    });
    if (originalCookieDescriptor) {
      Object.defineProperty(document, "cookie", originalCookieDescriptor);
    }
  });

  it("adds token to headers when cookie exists", () => {
    vi.spyOn(csrfManager, "getToken").mockReturnValue("abc123");

    const headers = csrfManager.addTokenToHeaders({
      Accept: "application/json",
    });

    expect(headers["x-csrf-token"]).toBe("abc123");
    expect(headers.Accept).toBe("application/json");
  });

  it("returns null and logs warning when cookie access throws", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get() {
        throw new Error("cookie blocked");
      },
    });

    expect(csrfManager.getToken()).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("hasToken returns false when token is absent", () => {
    vi.spyOn(csrfManager, "getToken").mockReturnValue(null);
    expect(csrfManager.hasToken()).toBe(false);
  });

  it("does not inject header when token is missing", () => {
    vi.spyOn(csrfManager, "getToken").mockReturnValue(null);

    const headers = csrfManager.addTokenToHeaders({
      Accept: "application/json",
    });

    expect(headers["x-csrf-token"]).toBeUndefined();
    expect(headers.Accept).toBe("application/json");
  });

  it("configure ignores empty values and keeps defaults", () => {
    csrfManager.configure({ cookieName: "", headerName: "" });

    expect(csrfManager.getConfig()).toEqual({
      cookieName: "csrfToken",
      headerName: "x-csrf-token",
    });
  });

  it("configure applies custom names and token lookup uses custom cookie", () => {
    csrfManager.configure({ cookieName: "customCsrf", headerName: "x-custom" });
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get() {
        return "customCsrf=token-value";
      },
    });

    expect(csrfManager.getToken()).toBe("token-value");

    const headers = csrfManager.addTokenToHeaders({});
    expect(headers["x-custom"]).toBe("token-value");
  });
});
