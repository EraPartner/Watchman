// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWebSocket } from "./useWebSocket";

const {
  invalidateQueries,
  toastSuccess,
  toastError,
  toastWarning,
  toastInfo,
  loggerWarn,
  loggerError,
  loggerDebug,
  loggerWebsocket,
} = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
  toastInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerDebug: vi.fn(),
  loggerWebsocket: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
    warning: toastWarning,
    info: toastInfo,
  },
}));

vi.mock("../lib/logger", () => ({
  logger: {
    warn: loggerWarn,
    error: loggerError,
    debug: loggerDebug,
    websocket: loggerWebsocket,
  },
}));

vi.mock("../lib/backendUrl", () => ({
  getWebSocketUrl: () => "ws://localhost:3001/ws",
}));

type HookApi = {
  connect: () => void;
  disconnect: () => void;
  sendMessage: (message: unknown) => void;
};

type SocketHandler<T> = ((event: T) => void) | null;

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: SocketHandler<{ code: number; reason: string }> = null;
  onerror: SocketHandler<unknown> = null;
  onmessage: SocketHandler<{ data: string }> = null;
  sent: string[] = [];

  constructor(_url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close(code = 1000, reason = "") {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  emitRawMessage(data: string) {
    this.onmessage?.({ data });
  }
}

let mockedNow = 0;

function HookProbe({ onHook }: { onHook: (value: HookApi) => void }) {
  const hook = useWebSocket();
  onHook(hook);
  return null;
}

describe("useWebSocket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedNow += 6000;
    vi.setSystemTime(mockedNow);
    vi.clearAllMocks();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.instances = [];
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    for (const socket of FakeWebSocket.instances) {
      if (socket.readyState !== FakeWebSocket.CLOSED) {
        socket.close(1000, "Test cleanup");
      }
    }
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("batches duplicate service updates and invalidates services health", async () => {
    let hookApi: HookApi | null = null;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<HookProbe onHook={(value) => (hookApi = value)} />);
    });

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeTruthy();

    socket.emitMessage({ type: "service_update", service: "adguard_main" });
    socket.emitMessage({ type: "service_update", service: "adguard_main" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["adguard", "status", "adguard_main"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["adguard", "stats", "adguard_main"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["adguard", "full"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["services", "health"],
    });

    await act(async () => {
      hookApi?.disconnect();
      root.unmount();
    });
  });

  it("routes alert levels to toasts and warns on unknown messages", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<HookProbe onHook={() => {}} />);
    });

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeTruthy();

    socket.emitMessage({
      type: "alert",
      level: "error",
      message: "error alert",
    });
    socket.emitMessage({
      type: "alert",
      level: "warning",
      message: "warning alert",
    });
    socket.emitMessage({ type: "alert", level: "info", message: "info alert" });
    socket.emitMessage({
      type: "unknown",
      timestamp: new Date().toISOString(),
    });

    expect(toastError).toHaveBeenCalledWith("error alert");
    expect(toastWarning).toHaveBeenCalledWith("warning alert");
    expect(toastInfo).toHaveBeenCalledWith("info alert");
    expect(loggerWarn).toHaveBeenCalledWith(
      "[WEBSOCKET] Unknown message type",
      {
        message: {
          type: "unknown",
          timestamp: expect.any(String),
        },
      }
    );

    act(() => {
      root.unmount();
    });
  });

  it("warns when sendMessage is called while disconnected", async () => {
    let hookApi: HookApi | null = null;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<HookProbe onHook={(value) => (hookApi = value)} />);
    });

    await act(async () => {
      hookApi?.disconnect();
      hookApi?.sendMessage({ type: "ping" });
    });

    expect(loggerWarn).toHaveBeenCalledWith(
      "[WEBSOCKET] Cannot send message: not connected"
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("logs send errors when socket send throws", async () => {
    let hookApi: HookApi | null = null;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<HookProbe onHook={(value) => (hookApi = value)} />);
    });

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeTruthy();

    socket.readyState = FakeWebSocket.OPEN;
    socket.send = () => {
      throw new Error("send failed");
    };

    await act(async () => {
      hookApi?.sendMessage({ type: "ping" });
    });

    expect(loggerError).toHaveBeenCalledWith(
      "[WEBSOCKET] Error sending message",
      expect.objectContaining({ message: "send failed" })
    );

    await act(async () => {
      hookApi?.disconnect();
      root.unmount();
    });
  });

  it("logs parse errors for malformed WebSocket payloads", async () => {
    let hookApi: HookApi | null = null;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<HookProbe onHook={(value) => (hookApi = value)} />);
    });

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeTruthy();

    socket.emitRawMessage("{not-json");

    expect(loggerError).toHaveBeenCalledWith(
      "[WEBSOCKET] Error parsing message",
      expect.any(SyntaxError)
    );

    await act(async () => {
      hookApi?.disconnect();
      root.unmount();
    });
  });

  it("schedules reconnect after abnormal close", async () => {
    let hookApi: HookApi | null = null;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<HookProbe onHook={(value) => (hookApi = value)} />);
    });

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeTruthy();

    await act(async () => {
      socket.close(1006, "abnormal");
    });

    expect(loggerWebsocket).toHaveBeenCalledWith(
      "WebSocket connection closed",
      {
        code: 1006,
        reason: "abnormal",
      }
    );
    expect(loggerDebug).toHaveBeenCalledWith(
      "[WEBSOCKET] Scheduling reconnect",
      expect.objectContaining({ attempt: 2, delay: 2000 })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(loggerDebug).toHaveBeenCalledWith(
      "[WEBSOCKET] Connection throttled",
      expect.objectContaining({ minIntervalMs: 5000 })
    );

    await act(async () => {
      hookApi?.disconnect();
      root.unmount();
    });
  });

  it("flushes pending invalidations on unmount", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<HookProbe onHook={() => {}} />);
    });

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeTruthy();

    socket.emitMessage({ type: "service_update", service: "adguard_main" });

    await act(async () => {
      root.unmount();
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["adguard", "status", "adguard_main"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["services", "health"],
    });
  });

  it("invalidates tor and router query families for service updates", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<HookProbe onHook={() => {}} />);
    });

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeTruthy();

    socket.emitMessage({ type: "service_update", service: "tor_main" });
    socket.emitMessage({ type: "service_update", service: "beryl" });
    socket.emitMessage({ type: "service_update", service: "telenet" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["tor", "relay"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["router", "arp", "beryl"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["router", "arp", "telenet"],
    });

    act(() => {
      root.unmount();
    });
  });

  it("invalidates metrics key and shows connected toast", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<HookProbe onHook={() => {}} />);
    });

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeTruthy();

    socket.emitMessage({
      type: "connection",
      message: "Connected to WebSocket server",
      timestamp: new Date().toISOString(),
    });
    socket.emitMessage({
      type: "metrics",
      timestamp: new Date().toISOString(),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });

    expect(toastSuccess).toHaveBeenCalledWith("WebSocket connected");
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["metrics"],
    });

    act(() => {
      root.unmount();
    });
  });

  it("shows error toast when max reconnect attempts are reached", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<HookProbe onHook={() => {}} />);
    });

    await act(async () => {
      const socket = FakeWebSocket.instances[0];
      expect(socket).toBeTruthy();

      socket.close(1006, "abnormal");
      socket.close(1006, "abnormal");
      socket.close(1006, "abnormal");
      socket.close(1006, "abnormal");
      socket.close(1006, "abnormal");
    });

    expect(loggerWarn).toHaveBeenCalledWith(
      "[WEBSOCKET] Max reconnection attempts reached",
      expect.objectContaining({ reconnectAttempts: 5 })
    );
    expect(toastError).toHaveBeenCalledWith(
      "WebSocket connection failed after multiple attempts"
    );

    act(() => {
      root.unmount();
    });
  });
});
