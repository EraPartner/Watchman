// @vitest-environment jsdom
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryClientConfigRef = vi.hoisted(() => ({
  config: undefined as unknown,
}));

vi.mock("sonner", () => ({
  Toaster: () => <div data-testid="sonner" />,
  toast: Object.assign(() => {}, {
    success: () => {},
    error: () => {},
    info: () => {},
    warning: () => {},
  }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    QueryClient: class QueryClient {
      constructor(config?: unknown) {
        queryClientConfigRef.config = config;
      }
    },
    QueryClientProvider: ({ children }: { children: ReactNode }) => children,
    useQueryClient: () => ({
      invalidateQueries: () => {},
      setQueryData: () => {},
      getQueryData: () => undefined,
    }),
  };
});

vi.mock("@tanstack/react-query-devtools", () => ({
  ReactQueryDevtools: () => null,
}));

vi.mock("./components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("./components/AuthGuard", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("./hooks/useAuth", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("./providers/WebSocketProvider", () => ({
  WebSocketProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("./components/dashboard/BentoDashboard", () => ({
  default: () => <div>Bento Dashboard</div>,
}));

vi.mock("./pages/Login", () => ({
  default: () => <div>Login Page</div>,
}));

vi.mock("./pages/NotFound", () => ({
  default: () => <div>Not Found Page</div>,
}));

import App from "./App";

async function renderApp(path: string) {
  window.history.pushState({}, "", path);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<App />);
    await Promise.resolve();
    await Promise.resolve();
  });

  return { container, root };
}

describe("App routes", () => {
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

  it("renders Login page for /login route", async () => {
    const { container, root } = await renderApp("/login");

    expect(container.textContent).toContain("Login Page");

    act(() => {
      root.unmount();
    });
  });

  it("renders NotFound page for unknown route", async () => {
    const { container, root } = await renderApp("/does-not-exist");

    expect(container.textContent).toContain("Not Found Page");

    act(() => {
      root.unmount();
    });
  });

  it("uses retry policy that disables retries for 4xx errors", () => {
    const config = queryClientConfigRef.config as {
      defaultOptions?: {
        queries?: {
          retry?: (failureCount: number, error: unknown) => boolean;
        };
      };
    };

    const retry = config.defaultOptions?.queries?.retry;
    expect(retry).toBeTypeOf("function");

    expect(retry?.(0, { status: 404 })).toBe(false);
    expect(retry?.(0, { status: 429 })).toBe(false);
    expect(retry?.(0, { status: 503 })).toBe(true);
    expect(retry?.(2, { status: 503 })).toBe(true);
    expect(retry?.(3, { status: 503 })).toBe(false);
    expect(retry?.(0, new Error("network"))).toBe(true);
  });
});
