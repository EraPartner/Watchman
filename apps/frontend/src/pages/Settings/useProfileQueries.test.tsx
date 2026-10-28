// @vitest-environment jsdom
/**
 * The one-click profile controls (switcher, Activate, Auto-switch, Capture
 * network) call `mutate` without an error handler, so the hooks must report
 * failures themselves.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { setActiveMock, setAutoSwitchMock, captureNetworkMock, toastError } =
  vi.hoisted(() => ({
    setActiveMock: vi.fn(),
    setAutoSwitchMock: vi.fn(),
    captureNetworkMock: vi.fn(),
    toastError: vi.fn(),
  }));

vi.mock("../../services/profilesApi", () => ({
  profilesApi: {
    setActive: setActiveMock,
    setAutoSwitch: setAutoSwitchMock,
    captureNetwork: captureNetworkMock,
  },
}));

vi.mock("../../services/configApi", () => ({ configApi: {} }));

vi.mock("sonner", () => ({ toast: { error: toastError } }));

import {
  useCaptureNetwork,
  useSetActiveProfile,
  useSetAutoSwitch,
} from "./useProfileQueries";

interface Mutation {
  mutate: (input: unknown) => void;
}

function renderHook<T>(useHook: () => T, qc: QueryClient) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const result: { current: T } = { current: undefined as unknown as T };
  function Probe() {
    result.current = useHook();
    return null;
  }
  act(() => {
    root.render(
      React.createElement(
        QueryClientProvider,
        { client: qc },
        React.createElement(Probe)
      )
    );
  });
  return {
    result,
    unmount: () => act(() => root.unmount()),
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("profile mutation errors", () => {
  let qc: QueryClient;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    vi.clearAllMocks();
  });

  afterEach(() => {
    qc.clear();
    document.body.innerHTML = "";
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = false;
  });

  const cases: Array<
    [string, () => unknown, ReturnType<typeof vi.fn>, unknown, string]
  > = [
    [
      "useSetActiveProfile",
      useSetActiveProfile,
      setActiveMock,
      "p2",
      "Could not switch profile: boom",
    ],
    [
      "useSetAutoSwitch",
      useSetAutoSwitch,
      setAutoSwitchMock,
      true,
      "Could not change auto-switch: boom",
    ],
    [
      "useCaptureNetwork",
      useCaptureNetwork,
      captureNetworkMock,
      "p1",
      "Could not assign the network: boom",
    ],
  ];

  it.each(cases)(
    "%s toasts a failure",
    async (_name, useHook, apiMock, arg, message) => {
      apiMock.mockRejectedValueOnce(new Error("boom"));
      const { result, unmount } = renderHook(() => useHook(), qc);
      await act(async () => {
        (result.current as unknown as Mutation).mutate(arg);
        await flush();
      });
      expect(toastError).toHaveBeenCalledWith(message);
      unmount();
    }
  );
});
