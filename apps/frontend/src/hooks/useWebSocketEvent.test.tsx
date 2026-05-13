// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const subscribeMock = vi.fn();

vi.mock("../lib/wsEventBus", () => ({
  subscribeWsEvent: (...args: unknown[]) => subscribeMock(...args),
}));

import { useWebSocketEvent } from "./useWebSocketEvent";
import type { WsEvent } from "../lib/wsEventBus";

function makeEvent(type: WsEvent["type"]): WsEvent {
  return { type, timestamp: new Date().toISOString() };
}

function HookProbe({
  type,
  handler,
}: {
  type: Parameters<typeof useWebSocketEvent>[0];
  handler: (ev: WsEvent) => void;
}) {
  useWebSocketEvent(type, handler);
  return null;
}

describe("useWebSocketEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    document.body.innerHTML = "";
  });

  it("subscribes to wsEventBus on mount", async () => {
    subscribeMock.mockReturnValue(() => {});
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<HookProbe type="connection" handler={() => {}} />);
    });

    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(subscribeMock).toHaveBeenCalledWith(expect.any(Function));

    act(() => root.unmount());
  });

  it("unsubscribes on unmount by calling returned cleanup", async () => {
    const unsubMock = vi.fn();
    subscribeMock.mockReturnValue(unsubMock);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<HookProbe type="connection" handler={() => {}} />);
    });

    act(() => root.unmount());

    expect(unsubMock).toHaveBeenCalled();
  });

  it("forwards matching event type to handler", async () => {
    let capturedSubscriber: ((ev: WsEvent) => void) | null = null;
    subscribeMock.mockImplementation((fn: (ev: WsEvent) => void) => {
      capturedSubscriber = fn;
      return () => {};
    });

    const received: WsEvent[] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <HookProbe type="service_update" handler={(ev) => received.push(ev)} />
      );
    });

    await act(async () => {
      capturedSubscriber!(makeEvent("service_update"));
    });

    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe("service_update");

    act(() => root.unmount());
  });

  it("filters out non-matching event types", async () => {
    let capturedSubscriber: ((ev: WsEvent) => void) | null = null;
    subscribeMock.mockImplementation((fn: (ev: WsEvent) => void) => {
      capturedSubscriber = fn;
      return () => {};
    });

    const received: WsEvent[] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <HookProbe type="alert" handler={(ev) => received.push(ev)} />
      );
    });

    await act(async () => {
      capturedSubscriber!(makeEvent("service_update"));
    });

    expect(received).toHaveLength(0);

    act(() => root.unmount());
  });

  it("wildcard '*' receives all event types", async () => {
    let capturedSubscriber: ((ev: WsEvent) => void) | null = null;
    subscribeMock.mockImplementation((fn: (ev: WsEvent) => void) => {
      capturedSubscriber = fn;
      return () => {};
    });

    const received: WsEvent[] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <HookProbe type="*" handler={(ev) => received.push(ev)} />
      );
    });

    await act(async () => {
      capturedSubscriber!(makeEvent("connection"));
      capturedSubscriber!(makeEvent("alert"));
      capturedSubscriber!(makeEvent("metrics"));
    });

    expect(received).toHaveLength(3);

    act(() => root.unmount());
  });
});
