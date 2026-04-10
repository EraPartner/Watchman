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
import { logger } from "../lib/logger";

const mockedApiClient = apiClient as unknown as {
  getAuthMe: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
};

type CapturedAuth = ReturnType<typeof useAuth> | null;
let capturedAuth: CapturedAuth = null;

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

function AuthCapture() {
  capturedAuth = useAuth();
  return null;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("AuthProvider/useAuth", () => {
  afterEach(() => {
    vi.clearAllMocks();
    capturedAuth = null;
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

  it("falls back username to string id when username is missing", async () => {
    mockedApiClient.getAuthMe.mockResolvedValue({
      authenticated: true,
      user: { id: "fallback-id" },
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
        </AuthProvider>
      );
    });

    await flush();

    expect(
      container.querySelector('[data-testid="username"]')?.textContent
    ).toBe("fallback-id");

    await act(async () => {
      root.unmount();
    });
  });

  it("sets user to null and warns when auth bootstrap throws", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    mockedApiClient.getAuthMe.mockResolvedValue(
      Object.defineProperty({}, "authenticated", {
        get() {
          throw new Error("broken payload");
        },
      })
    );

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
        </AuthProvider>
      );
    });

    await flush();

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(
      container.querySelector('[data-testid="authenticated"]')?.textContent
    ).toBe("false");

    await act(async () => {
      root.unmount();
    });
  });

  it("returns Login failed when login response has no user", async () => {
    mockedApiClient.getAuthMe.mockResolvedValue({ authenticated: false });
    mockedApiClient.login.mockResolvedValue({});

    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AuthProvider>
          <AuthCapture />
        </AuthProvider>
      );
    });

    await flush();

    let result:
      | Awaited<ReturnType<NonNullable<CapturedAuth>["login"]>>
      | undefined;
    await act(async () => {
      result = await capturedAuth?.login("admin", "secret");
    });

    expect(result).toEqual({ success: false, error: "Login failed" });
    expect(capturedAuth?.error).toBe("Login failed");

    await act(async () => {
      root.unmount();
    });
  });

  it("surfaces network error when login throws", async () => {
    mockedApiClient.getAuthMe.mockResolvedValue({ authenticated: false });
    mockedApiClient.login.mockRejectedValue(new Error("network down"));

    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AuthProvider>
          <AuthCapture />
        </AuthProvider>
      );
    });

    await flush();

    let result:
      | Awaited<ReturnType<NonNullable<CapturedAuth>["login"]>>
      | undefined;
    await act(async () => {
      result = await capturedAuth?.login("admin", "secret");
    });

    expect(result).toEqual({ success: false, error: "network down" });
    expect(capturedAuth?.error).toBe("network down");

    await act(async () => {
      root.unmount();
    });
  });

  it("returns generic network error when login throws non-Error", async () => {
    mockedApiClient.getAuthMe.mockResolvedValue({ authenticated: false });
    mockedApiClient.login.mockRejectedValue("bad network");

    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AuthProvider>
          <AuthCapture />
        </AuthProvider>
      );
    });

    await flush();

    let result:
      | Awaited<ReturnType<NonNullable<CapturedAuth>["login"]>>
      | undefined;
    await act(async () => {
      result = await capturedAuth?.login("admin", "secret");
    });

    expect(result).toEqual({ success: false, error: "Network error" });
    expect(capturedAuth?.error).toBe("Network error");

    await act(async () => {
      root.unmount();
    });
  });

  it("returns success on login and keeps user authenticated", async () => {
    mockedApiClient.getAuthMe
      .mockResolvedValueOnce({ authenticated: false })
      .mockResolvedValueOnce({
        authenticated: true,
        user: { id: "admin-id", username: "admin" },
      });
    mockedApiClient.login.mockResolvedValue({
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
          <AuthCapture />
        </AuthProvider>
      );
    });

    await flush();

    let result:
      | Awaited<ReturnType<NonNullable<CapturedAuth>["login"]>>
      | undefined;
    await act(async () => {
      result = await capturedAuth?.login("admin", "secret");
    });

    expect(result).toEqual({
      success: true,
      user: { id: "admin-id", username: "admin" },
    });
    expect(capturedAuth?.isAuthenticated).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  it("returns logout error when apiClient.logout throws", async () => {
    mockedApiClient.getAuthMe.mockResolvedValue({
      authenticated: true,
      user: { id: "admin-id", username: "admin" },
    });
    mockedApiClient.logout.mockRejectedValue(new Error("logout failed"));

    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AuthProvider>
          <AuthCapture />
        </AuthProvider>
      );
    });

    await flush();

    let result:
      | Awaited<ReturnType<NonNullable<CapturedAuth>["logout"]>>
      | undefined;
    await act(async () => {
      result = await capturedAuth?.logout();
    });

    expect(result).toEqual({ success: false, error: "logout failed" });
    expect(capturedAuth?.error).toBe("logout failed");

    await act(async () => {
      root.unmount();
    });
  });

  it("returns generic network error when logout throws non-Error", async () => {
    mockedApiClient.getAuthMe.mockResolvedValue({
      authenticated: true,
      user: { id: "admin-id", username: "admin" },
    });
    mockedApiClient.logout.mockRejectedValue("logout failed");

    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AuthProvider>
          <AuthCapture />
        </AuthProvider>
      );
    });

    await flush();

    let result:
      | Awaited<ReturnType<NonNullable<CapturedAuth>["logout"]>>
      | undefined;
    await act(async () => {
      result = await capturedAuth?.logout();
    });

    expect(result).toEqual({ success: false, error: "Network error" });
    expect(capturedAuth?.error).toBe("Network error");

    await act(async () => {
      root.unmount();
    });
  });

  it("clears user and returns success on logout", async () => {
    mockedApiClient.getAuthMe.mockResolvedValue({
      authenticated: true,
      user: { id: "admin-id", username: "admin" },
    });
    mockedApiClient.logout.mockResolvedValue(undefined);

    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AuthProvider>
          <AuthCapture />
        </AuthProvider>
      );
    });

    await flush();

    let result:
      | Awaited<ReturnType<NonNullable<CapturedAuth>["logout"]>>
      | undefined;
    await act(async () => {
      result = await capturedAuth?.logout();
    });

    expect(result).toEqual({ success: true });
    expect(capturedAuth?.isAuthenticated).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });

  it("throws when useAuth is called outside AuthProvider", async () => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    expect(() => {
      act(() => {
        root.render(<AuthProbe />);
      });
    }).toThrow("useAuth must be used within AuthProvider");

    await act(async () => {
      root.unmount();
    });
  });
});
