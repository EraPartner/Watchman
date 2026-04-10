import { describe, expect, it } from "vitest";
import {
  extractApiError,
  isApiResponseEnvelope,
  unwrapApiResponse,
} from "./apiResponse";

describe("isApiResponseEnvelope", () => {
  it("returns true for valid envelope shape", () => {
    expect(
      isApiResponseEnvelope({ success: true, data: { id: 1 }, error: null })
    ).toBe(true);
  });

  it("returns false for non-object or missing required keys", () => {
    expect(isApiResponseEnvelope(null)).toBe(false);
    expect(isApiResponseEnvelope("not-an-object")).toBe(false);
    expect(isApiResponseEnvelope({ success: true, data: {} })).toBe(false);
    expect(
      isApiResponseEnvelope({ success: "yes", data: {}, error: null })
    ).toBe(false);
  });
});

describe("unwrapApiResponse", () => {
  it("returns _payload when envelope provides it", () => {
    const payload = {
      success: true,
      data: { old: "shape" },
      error: null,
      _payload: { normalized: true },
    };

    expect(unwrapApiResponse(payload)).toEqual({ normalized: true });
  });

  it("returns data when _payload is not present", () => {
    const payload = {
      success: true,
      data: { source: "data" },
      error: null,
    };

    expect(unwrapApiResponse(payload)).toEqual({ source: "data" });
  });

  it("returns input as-is for non-envelope payloads", () => {
    expect(unwrapApiResponse("plain")).toBe("plain");
    expect(unwrapApiResponse({ plain: true })).toEqual({ plain: true });
  });
});

describe("extractApiError", () => {
  it("prefers envelope error over envelope message and fallback", () => {
    const payload = {
      success: false,
      data: null,
      error: "primary envelope error",
      message: "secondary message",
    };

    expect(extractApiError(payload, "fallback")).toBe("primary envelope error");
  });

  it("uses envelope message when envelope error is empty", () => {
    const payload = {
      success: false,
      data: null,
      error: "   ",
      message: "use this message",
    };

    expect(extractApiError(payload, "fallback")).toBe("use this message");
  });

  it("uses object error then object message for non-envelope payloads", () => {
    expect(
      extractApiError(
        { error: "object error", message: "object message" },
        "fb"
      )
    ).toBe("object error");
    expect(
      extractApiError({ error: " ", message: "object message" }, "fb")
    ).toBe("object message");
  });

  it("returns fallback when no usable error fields exist", () => {
    expect(extractApiError({ error: "   ", message: "  " }, "fallback")).toBe(
      "fallback"
    );
    expect(extractApiError("unexpected", "fallback")).toBe("fallback");
  });
});
