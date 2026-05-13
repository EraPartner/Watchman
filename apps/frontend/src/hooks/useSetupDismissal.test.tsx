// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSetupDismissal } from "./useSetupDismissal";

const KEY = "watchman.setupDismissed";

// jsdom may not expose localStorage for opaque origins — provide a minimal stub.
function makeLocalStorageStub() {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
}

type HookResult = ReturnType<typeof useSetupDismissal>;

function HookProbe({ onHook }: { onHook: (result: HookResult) => void }) {
  const result = useSetupDismissal();
  onHook(result);
  return null;
}

describe("useSetupDismissal", () => {
  let fakeStorage: ReturnType<typeof makeLocalStorageStub>;

  beforeEach(() => {
    fakeStorage = makeLocalStorageStub();
    vi.stubGlobal("localStorage", fakeStorage);
    Object.defineProperty(window, "localStorage", {
      value: fakeStorage,
      configurable: true,
    });
    vi.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  async function mount() {
    let hookResult: HookResult | null = null;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<HookProbe onHook={(r) => (hookResult = r)} />);
    });

    return { root, getResult: () => hookResult! };
  }

  it("starts with dismissed=false when localStorage is empty", async () => {
    const { root, getResult } = await mount();
    expect(getResult().dismissed).toBe(false);
    act(() => root.unmount());
  });

  it("starts with dismissed=true when localStorage key is '1'", async () => {
    fakeStorage.setItem(KEY, "1");
    const { root, getResult } = await mount();
    expect(getResult().dismissed).toBe(true);
    act(() => root.unmount());
  });

  it("dismiss() sets dismissed=true and writes to localStorage", async () => {
    const { root, getResult } = await mount();

    await act(async () => {
      getResult().dismiss();
    });

    expect(getResult().dismissed).toBe(true);
    expect(fakeStorage.getItem(KEY)).toBe("1");

    act(() => root.unmount());
  });

  it("reset() sets dismissed=false and removes localStorage key", async () => {
    fakeStorage.setItem(KEY, "1");
    const { root, getResult } = await mount();

    expect(getResult().dismissed).toBe(true);

    await act(async () => {
      getResult().reset();
    });

    expect(getResult().dismissed).toBe(false);
    expect(fakeStorage.getItem(KEY)).toBeNull();

    act(() => root.unmount());
  });

  it("responds to storage events from other tabs", async () => {
    const { root, getResult } = await mount();

    expect(getResult().dismissed).toBe(false);

    await act(async () => {
      fakeStorage.setItem(KEY, "1");
      window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    });

    expect(getResult().dismissed).toBe(true);

    act(() => root.unmount());
  });

  it("ignores storage events for unrelated keys", async () => {
    const { root, getResult } = await mount();

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "some-other-key" })
      );
    });

    expect(getResult().dismissed).toBe(false);

    act(() => root.unmount());
  });
});
