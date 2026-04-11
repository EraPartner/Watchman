// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const buildHrefMock = vi.fn();
const formatDisplayUrlMock = vi.fn();
const openHrefMock = vi.fn();

vi.mock("../lib/url", () => ({
  buildHref: (...args: unknown[]) => buildHrefMock(...args),
  formatDisplayUrl: (...args: unknown[]) => formatDisplayUrlMock(...args),
  openHref: (...args: unknown[]) => openHrefMock(...args),
}));

vi.mock("lucide-react", () => ({
  ExternalLink: () => <span />,
}));

import { ServiceLink } from "./ServiceLink";

async function renderLink(props: React.ComponentProps<typeof ServiceLink>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<ServiceLink {...props} />);
  });

  return { container, root };
}

describe("ServiceLink", () => {
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

  it("renders N/A when raw URL is missing", async () => {
    const { container, root } = await renderLink({ raw: undefined });

    expect(container.textContent).toContain("N/A");
    expect(buildHrefMock).not.toHaveBeenCalled();
    expect(formatDisplayUrlMock).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("uses hostOnly display and opens computed href on click", async () => {
    buildHrefMock.mockReturnValue("https://example.test/path");

    const { container, root } = await renderLink({
      raw: "https://example.test/path?q=1",
      hostOnly: true,
      preferHttps: true,
    });

    expect(container.textContent).toContain("example.test");
    expect(formatDisplayUrlMock).not.toHaveBeenCalled();
    expect(buildHrefMock).toHaveBeenCalledWith(
      "https://example.test/path?q=1",
      true
    );

    const button = container.querySelector("button");
    expect(button).not.toBeNull();

    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(openHrefMock).toHaveBeenCalledWith("https://example.test/path");

    act(() => root.unmount());
  });
});
