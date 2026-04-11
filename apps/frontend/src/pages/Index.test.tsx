// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockedUseWebSocket = vi.fn();
const mockedUseAuth = vi.fn();
const mockedNavigate = vi.fn();
const mockedLogout = vi.fn();

vi.mock("../hooks/useWebSocket", () => ({
  useWebSocket: () => mockedUseWebSocket(),
}));

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => mockedUseAuth(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockedNavigate,
}));

vi.mock("../components/LiveServerDashboard", () => ({
  LiveServerDashboard: () => <div data-testid="dashboard">dashboard</div>,
}));

vi.mock("../lib/logger", () => ({
  logger: {
    serviceWorker: vi.fn(),
    error: vi.fn(),
  },
}));

import Index from "./Index";

function renderIndex() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<Index />);
  });

  return { container, root };
}

describe("Index", () => {
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mockedLogout.mockReset();
    mockedNavigate.mockReset();
    mockedUseWebSocket.mockReturnValue({
      isConnected: false,
      reconnectAttempts: 0,
    });
    mockedUseAuth.mockReturnValue({
      user: undefined,
      isAuthenticated: false,
      logout: mockedLogout,
      loading: false,
    });
  });

  afterEach(() => {
    mockedUseWebSocket.mockReset();
    mockedUseAuth.mockReset();
    mockedNavigate.mockReset();
    mockedLogout.mockReset();
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = false;
    document.body.innerHTML = "";
  });

  it("shows reconnect attempt count when disconnected after retries", () => {
    mockedUseWebSocket.mockReturnValue({
      isConnected: false,
      reconnectAttempts: 2,
    });

    const { container, root } = renderIndex();

    expect(container.textContent).toContain(
      "Reconnecting to live updates... (attempt 2/5)"
    );

    act(() => {
      root.unmount();
    });
  });

  it("shows connecting message when disconnected with zero retries", () => {
    mockedUseWebSocket.mockReturnValue({
      isConnected: false,
      reconnectAttempts: 0,
    });

    const { container, root } = renderIndex();

    expect(container.textContent).toContain("Connecting to live updates...");

    act(() => {
      root.unmount();
    });
  });

  it("does not show connection banner when websocket is connected", () => {
    mockedUseWebSocket.mockReturnValue({
      isConnected: true,
      reconnectAttempts: 0,
    });

    const { container, root } = renderIndex();

    expect(container.textContent).not.toContain(
      "Connecting to live updates..."
    );
    expect(container.textContent).toContain("Live");

    act(() => {
      root.unmount();
    });
  });

  it("renders login link when user is not authenticated", () => {
    mockedUseAuth.mockReturnValue({
      user: undefined,
      isAuthenticated: false,
      logout: mockedLogout,
      loading: false,
    });

    const { container, root } = renderIndex();

    const loginLink = container.querySelector('a[href="/login"]');
    expect(loginLink?.textContent).toBe("Login");

    act(() => {
      root.unmount();
    });
  });

  it("logs out and navigates to /login when logout button is clicked", async () => {
    mockedUseAuth.mockReturnValue({
      user: { username: "admin" },
      isAuthenticated: true,
      logout: mockedLogout.mockResolvedValue({ success: true }),
      loading: false,
    });

    const { container, root } = renderIndex();

    const logoutButton = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      logoutButton.click();
      await Promise.resolve();
    });

    expect(mockedLogout).toHaveBeenCalledTimes(1);
    expect(mockedNavigate).toHaveBeenCalledWith("/login");

    act(() => {
      root.unmount();
    });
  });
});
