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
import { actAsync } from "@/test/actAsync";
import { required } from "@/test/required";

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
  await actAsync(() => root.render(element));
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
    // A holder object: TypeScript does not see the assignment in the
    // component and would narrow a plain `let` to null.
    const captured: {
      value: { isConnected: boolean; reconnectAttempts: number } | null;
    } = { value: null };

    function Consumer() {
      captured.value = useWebSocketContext();
      return h("span", {}, "ok");
    }

    const { root } = await render(
      <WebSocketProvider>
        <Consumer />
      </WebSocketProvider>
    );
    expect(required(captured.value).isConnected).toBe(true);
    expect(required(captured.value).reconnectAttempts).toBe(0);
    act(() => root.unmount());
  });
});

describe("useWebSocketContext (outside provider)", () => {
  it("returns default values when no provider is present", async () => {
    // A holder object: TypeScript does not see the assignment in the
    // component and would narrow a plain `let` to null.
    const captured: {
      value: { isConnected: boolean; reconnectAttempts: number } | null;
    } = { value: null };

    function Standalone() {
      captured.value = useWebSocketContext();
      return h("span", {}, "ok");
    }

    const { root } = await render(<Standalone />);
    expect(required(captured.value).isConnected).toBe(false);
    expect(required(captured.value).reconnectAttempts).toBe(0);
    act(() => root.unmount());
  });
});
