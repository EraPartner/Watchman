// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/ApiClient", () => ({
  apiClient: {
    getAuthMe: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

import { AuthProvider, useAuth } from "./useAuth";
import { apiClient } from "../services/ApiClient";

const mockedApiClient = apiClient as unknown as {
  getAuthMe: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
};

function AuthProbe() {
  const { isAuthenticated, loading, user } = useAuth();
  return (
    <div>
      <div data-testid="loading">{loading ? "true" : "false"}</div>
      <div data-testid="authenticated">
        {isAuthenticated ? "true" : "false"}
      </div>
      <div data-testid="username">{user?.username || ""}</div>
      <div data-testid="userid">{String(user?.id ?? "")}</div>
    </div>
  );
}

describe("AuthProvider/useAuth", () => {
  afterEach(() => {
    vi.clearAllMocks();
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = false;
    document.body.innerHTML = "";
  });

  it("fetches auth state once for multiple consumers", async () => {
    mockedApiClient.getAuthMe.mockResolvedValue({
      authenticated: true,
      user: { id: "admin-id", username: "admin" },
    });

    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AuthProvider>
          <AuthProbe />
          <AuthProbe />
        </AuthProvider>
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedApiClient.getAuthMe).toHaveBeenCalledTimes(1);
    const usernameValues = Array.from(
      container.querySelectorAll('[data-testid="username"]')
    ).map((node) => node.textContent);
    const idValues = Array.from(
      container.querySelectorAll('[data-testid="userid"]')
    ).map((node) => node.textContent);

    expect(usernameValues[0]).toBe("admin");
    expect(idValues[0]).toBe("admin-id");

    await act(async () => {
      root.unmount();
    });
  });
});
