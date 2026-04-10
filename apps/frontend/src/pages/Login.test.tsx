// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockedLogin = vi.fn();
const mockedNavigate = vi.fn();
const mockedUseAuth = vi.fn();

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => mockedUseAuth(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockedNavigate,
}));

import Login from "./Login";

function renderLogin() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<Login />);
  });

  return { container, root };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  );
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("Login", () => {
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    mockedLogin.mockReset();
    mockedNavigate.mockReset();
    mockedUseAuth.mockReset();
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = false;
    document.body.innerHTML = "";
  });

  it("redirects immediately when already authenticated", () => {
    mockedUseAuth.mockReturnValue({
      login: mockedLogin,
      isAuthenticated: true,
      loading: false,
      error: null,
    });

    const { root } = renderLogin();

    expect(mockedNavigate).toHaveBeenCalledWith("/");

    act(() => {
      root.unmount();
    });
  });

  it("shows validation error when username/password missing", async () => {
    mockedUseAuth.mockReturnValue({
      login: mockedLogin,
      isAuthenticated: false,
      loading: false,
      error: null,
    });

    const { container, root } = renderLogin();
    const form = container.querySelector("form");

    await act(async () => {
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });

    expect(container.textContent).toContain(
      "Please enter username and password"
    );
    expect(mockedLogin).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("calls login with remember and navigates on success", async () => {
    mockedLogin.mockResolvedValue({ success: true });
    mockedUseAuth.mockReturnValue({
      login: mockedLogin,
      isAuthenticated: false,
      loading: false,
      error: null,
    });

    const { container, root } = renderLogin();
    const inputs = container.querySelectorAll("input");
    const usernameInput = inputs[0] as HTMLInputElement;
    const passwordInput = inputs[1] as HTMLInputElement;
    const rememberInput = inputs[2] as HTMLInputElement;
    const form = container.querySelector("form");

    await act(async () => {
      setInputValue(usernameInput, "admin");
      setInputValue(passwordInput, "secret");
      rememberInput.click();
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
      await Promise.resolve();
    });

    expect(mockedLogin).toHaveBeenCalledWith("admin", "secret", true);
    expect(mockedNavigate).toHaveBeenCalledWith("/");

    act(() => {
      root.unmount();
    });
  });

  it("shows api error when login fails", async () => {
    mockedLogin.mockResolvedValue({
      success: false,
      error: "Invalid credentials",
    });
    mockedUseAuth.mockReturnValue({
      login: mockedLogin,
      isAuthenticated: false,
      loading: false,
      error: null,
    });

    const { container, root } = renderLogin();
    const inputs = container.querySelectorAll("input");
    const usernameInput = inputs[0] as HTMLInputElement;
    const passwordInput = inputs[1] as HTMLInputElement;
    const form = container.querySelector("form");

    await act(async () => {
      setInputValue(usernameInput, "admin");
      setInputValue(passwordInput, "wrong");
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Invalid credentials");

    act(() => {
      root.unmount();
    });
  });

  it("shows default error when login fails without error message", async () => {
    mockedLogin.mockResolvedValue({ success: false });
    mockedUseAuth.mockReturnValue({
      login: mockedLogin,
      isAuthenticated: false,
      loading: false,
      error: null,
    });

    const { container, root } = renderLogin();
    const inputs = container.querySelectorAll("input");
    const usernameInput = inputs[0] as HTMLInputElement;
    const passwordInput = inputs[1] as HTMLInputElement;
    const form = container.querySelector("form");

    await act(async () => {
      setInputValue(usernameInput, "admin");
      setInputValue(passwordInput, "wrong");
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Login failed");

    act(() => {
      root.unmount();
    });
  });

  it("renders auth context error when form has no local error", () => {
    mockedUseAuth.mockReturnValue({
      login: mockedLogin,
      isAuthenticated: false,
      loading: false,
      error: "Session expired",
    });

    const { container, root } = renderLogin();

    expect(container.textContent).toContain("Session expired");

    act(() => {
      root.unmount();
    });
  });

  it("disables submit button and shows loading copy", () => {
    mockedUseAuth.mockReturnValue({
      login: mockedLogin,
      isAuthenticated: false,
      loading: true,
      error: null,
    });

    const { container, root } = renderLogin();
    const submitButton = container.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement;

    expect(submitButton.disabled).toBe(true);
    expect(submitButton.textContent).toBe("Signing in...");

    act(() => {
      root.unmount();
    });
  });
});
