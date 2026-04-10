// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

const mockedUseAuth = vi.fn();

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => mockedUseAuth(),
}));

vi.mock("react-router-dom", () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
}));

import AuthGuard from "./AuthGuard";

describe("AuthGuard", () => {
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

  it("shows loading state while auth is resolving", () => {
    mockedUseAuth.mockReturnValue({ loading: true, isAuthenticated: false });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <AuthGuard>
          <div>Protected</div>
        </AuthGuard>
      );
    });

    expect(container.textContent).toContain("Checking authentication...");

    act(() => {
      root.unmount();
    });
  });

  it("redirects to /login when unauthenticated", () => {
    mockedUseAuth.mockReturnValue({ loading: false, isAuthenticated: false });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <AuthGuard>
          <div>Protected</div>
        </AuthGuard>
      );
    });

    expect(
      container.querySelector('[data-testid="navigate"]')?.textContent
    ).toBe("/login");

    act(() => {
      root.unmount();
    });
  });

  it("renders children when authenticated", () => {
    mockedUseAuth.mockReturnValue({ loading: false, isAuthenticated: true });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <AuthGuard>
          <div>Protected content</div>
        </AuthGuard>
      );
    });

    expect(container.textContent).toContain("Protected content");

    act(() => {
      root.unmount();
    });
  });
});
