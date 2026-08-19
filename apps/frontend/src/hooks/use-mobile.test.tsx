// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useIsMobile } from "./use-mobile";

function Probe({ onValue }: { onValue: (value: boolean) => void }) {
  const value = useIsMobile();
  onValue(value);
  return null;
}

function createMqlMock() {
  let listener: ((event?: Event) => void) | undefined;
  const mql = {
    addEventListener: vi.fn((event: string, cb: (event?: Event) => void) => {
      if (event === "change") listener = cb;
    }),
    removeEventListener: vi.fn((event: string, cb: (event?: Event) => void) => {
      if (event === "change" && listener === cb) listener = undefined;
    }),
    trigger: () => {
      listener?.();
    },
  };

  return mql;
}

describe("useIsMobile", () => {
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = false;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("returns true below breakpoint and updates when viewport changes", async () => {
    const mql = createMqlMock();
    const matchMediaSpy = vi.fn(
      () => mql as unknown as MediaQueryList
    );
    vi.stubGlobal("matchMedia", matchMediaSpy);

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 500,
    });

    let currentValue = false;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Probe onValue={(value) => (currentValue = value)} />);
    });

    expect(matchMediaSpy).toHaveBeenCalledWith("(max-width: 767px)");
    expect(currentValue).toBe(true);

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
    });

    await act(async () => {
      mql.trigger();
    });

    expect(currentValue).toBe(false);

    act(() => root.unmount());
  });

  it("removes media query listener on unmount", async () => {
    const mql = createMqlMock();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => mql as unknown as MediaQueryList)
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Probe onValue={() => {}} />);
    });

    expect(mql.addEventListener).toHaveBeenCalledTimes(1);

    act(() => root.unmount());

    expect(mql.removeEventListener).toHaveBeenCalledTimes(1);
    expect(mql.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );
  });
});
