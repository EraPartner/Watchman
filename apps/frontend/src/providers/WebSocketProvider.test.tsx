// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";

vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: vi.fn(() => ({
    isConnected: true,
    reconnectAttempts: 0,
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendMessage: vi.fn(),
  })),
}));

import { WebSocketProvider, useWebSocketContext } from "./WebSocketProvider";

beforeEach(() => {
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

async function render(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return { container, root };
}

describe("WebSocketProvider", () => {
  it("renders children without crashing", async () => {
    const { container, root } = await render(
      <WebSocketProvider>
        <span id="child">child</span>
      </WebSocketProvider>
    );
    expect(container.querySelector("#child")).toBeTruthy();
    act(() => root.unmount());
  });

  it("provides context to children via useWebSocketContext", async () => {
    let captured: { isConnected: boolean; reconnectAttempts: number } | null =
      null;

    function Consumer() {
      captured = useWebSocketContext();
      return h("span", {}, "ok");
    }

    const { root } = await render(
      <WebSocketProvider>
        <Consumer />
      </WebSocketProvider>
    );
    expect(captured!.isConnected).toBe(true);
    expect(captured!.reconnectAttempts).toBe(0);
    act(() => root.unmount());
  });
});

describe("useWebSocketContext (outside provider)", () => {
  it("returns default values when no provider is present", async () => {
    let captured: { isConnected: boolean; reconnectAttempts: number } | null =
      null;

    function Standalone() {
      captured = useWebSocketContext();
      return h("span", {}, "ok");
    }

    const { root } = await render(<Standalone />);
    expect(captured!.isConnected).toBe(false);
    expect(captured!.reconnectAttempts).toBe(0);
    act(() => root.unmount());
  });
});
