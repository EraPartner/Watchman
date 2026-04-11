// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useQueryMock = vi.fn();
const getServiceUpdatesMock = vi.fn();
const loggerDebugMock = vi.fn();
const loggerWarnMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("../services/ApiClient", () => ({
  apiClient: {
    getServiceUpdates: (...args: unknown[]) => getServiceUpdatesMock(...args),
  },
}));

vi.mock("../lib/logger", () => ({
  logger: {
    debug: (...args: unknown[]) => loggerDebugMock(...args),
    warn: (...args: unknown[]) => loggerWarnMock(...args),
  },
}));

vi.mock("./ui/badge", () => ({
  Badge: ({
    children,
    onClick,
    title,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    title?: string;
  }) => (
    <button type="button" onClick={onClick} title={title}>
      {children}
    </button>
  ),
}));

vi.mock("lucide-react", () => ({
  AlertCircle: () => <span />,
  RefreshCw: () => <span />,
}));

import { UpdateBadge } from "./UpdateBadge";

async function renderBadge() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<UpdateBadge service="tor" />);
    await Promise.resolve();
  });

  return { container, root };
}

describe("UpdateBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("returns null when queryFn receives a 503 error", async () => {
    useQueryMock.mockImplementation(
      (options: { queryFn: () => Promise<unknown> }) => {
        options.queryFn();
        return {
          data: null,
          isLoading: false,
          error: undefined,
        };
      }
    );

    getServiceUpdatesMock.mockRejectedValue({ status: 503 });

    const { container, root } = await renderBadge();

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toBe("");
    expect(loggerDebugMock).toHaveBeenCalledWith(
      "[UpdateBadge] Service not configured",
      { service: "tor" }
    );

    act(() => root.unmount());
  });

  it("renders update badge and opens release URL on click", async () => {
    const openMock = vi
      .spyOn(window, "open")
      .mockImplementation(() => null as unknown as Window);

    useQueryMock.mockReturnValue({
      data: {
        currentVersion: "1.0.0",
        latestVersion: "1.1.0",
        updateAvailable: true,
        releaseUrl: "https://example.test/release",
      },
      isLoading: false,
      error: undefined,
    });

    const { container, root } = await renderBadge();

    expect(container.textContent).toContain("Update: 1.1.0");
    const button = container.querySelector("button");
    expect(button).not.toBeNull();

    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(openMock).toHaveBeenCalledWith(
      "https://example.test/release",
      "_blank",
      "noopener,noreferrer"
    );

    openMock.mockRestore();
    act(() => root.unmount());
  });

  it("logs warning when query has an error", async () => {
    useQueryMock.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error("boom"),
    });

    const { root } = await renderBadge();

    expect(loggerWarnMock).toHaveBeenCalledWith(
      "[UpdateBadge] Failed to check updates",
      {
        service: "tor",
        error: "boom",
      }
    );

    act(() => root.unmount());
  });
});
