// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

const loggerErrorMock = vi.fn();

vi.mock("../lib/logger", () => ({
  logger: {
    error: (...args: unknown[]) => loggerErrorMock(...args),
  },
}));

import { ErrorBoundary } from "./ErrorBoundary";

function Thrower({ message = "boom" }: { message?: string }) {
  throw new Error(message);
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = false;
    document.body.innerHTML = "";
  });

  it("renders children when no error occurs", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <ErrorBoundary>
          <div>Healthy content</div>
        </ErrorBoundary>
      );
    });

    expect(container.textContent).toContain("Healthy content");
    expect(loggerErrorMock).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("renders fallback prop when provided", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    expect(() => {
      act(() => {
        root.render(
          <ErrorBoundary fallback={<div>Custom fallback</div>}>
            <Thrower />
          </ErrorBoundary>
        );
      });
    }).not.toThrow();

    expect(container.textContent).toContain("Custom fallback");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "[ERROR_BOUNDARY] Caught component error",
      expect.objectContaining({
        error: "boom",
        stack: expect.any(String),
        componentStack: expect.any(String),
      })
    );

    act(() => root.unmount());
  });

  it("renders default fallback UI and can reset with Try Again", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    let shouldThrow = true;
    function ToggleThrower() {
      if (shouldThrow) {
        throw new Error("transient error");
      }
      return <div>Recovered content</div>;
    }

    expect(() => {
      act(() => {
        root.render(
          <ErrorBoundary>
            <ToggleThrower />
          </ErrorBoundary>
        );
      });
    }).not.toThrow();

    expect(container.textContent).toContain("Something went wrong");
    expect(container.textContent).toContain("Try Again");

    shouldThrow = false;
    const retryButton = container.querySelector("button");
    expect(retryButton).not.toBeNull();

    act(() => {
      retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Recovered content");

    act(() => root.unmount());
  });
});
