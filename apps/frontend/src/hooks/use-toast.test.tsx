// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reducer, useToast } from "./use-toast";

function HookProbe({
  onValue,
}: {
  onValue: (value: ReturnType<typeof useToast>) => void;
}) {
  const value = useToast();
  onValue(value);
  return null;
}

describe("use-toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = false;
    document.body.innerHTML = "";
  });

  it("keeps only the latest toast when adding more than limit", () => {
    const next = reducer(
      {
        toasts: [{ id: "1", open: true }],
      },
      {
        type: "ADD_TOAST",
        toast: { id: "2", open: true },
      }
    );

    expect(next.toasts).toHaveLength(1);
    expect(next.toasts[0].id).toBe("2");
  });

  it("dismisses all toasts when no toastId is provided", () => {
    const next = reducer(
      {
        toasts: [
          { id: "1", open: true },
          { id: "2", open: true },
        ],
      },
      {
        type: "DISMISS_TOAST",
      }
    );

    expect(next.toasts).toEqual([
      { id: "1", open: false },
      { id: "2", open: false },
    ]);
  });

  it("adds, updates, dismisses, and removes toast via hook API", async () => {
    let hookValue: ReturnType<typeof useToast> | null = null;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<HookProbe onValue={(value) => (hookValue = value)} />);
    });

    expect(hookValue?.toasts).toHaveLength(0);

    let toastControls:
      | {
          id: string;
          dismiss: () => void;
          update: (props: { title?: React.ReactNode }) => void;
        }
      | undefined;

    await act(async () => {
      toastControls = hookValue?.toast({ title: "First toast" });
    });

    expect(hookValue?.toasts).toHaveLength(1);
    expect(hookValue?.toasts[0].title).toBe("First toast");

    await act(async () => {
      toastControls?.update({ title: "Updated toast" });
    });

    expect(hookValue?.toasts[0].title).toBe("Updated toast");
    expect(hookValue?.toasts[0].open).toBe(true);

    await act(async () => {
      toastControls?.dismiss();
    });

    expect(hookValue?.toasts[0].open).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000_000);
    });

    expect(hookValue?.toasts).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });
});
