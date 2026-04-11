// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import NotFound from "./NotFound";

function renderNotFound() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<NotFound />);
  });

  return { container, root };
}

describe("NotFound", () => {
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

  it("renders 404 heading", () => {
    const { container, root } = renderNotFound();

    const heading = container.querySelector("h1");
    expect(heading?.textContent).toBe("404");

    act(() => {
      root.unmount();
    });
  });

  it("renders page not found message", () => {
    const { container, root } = renderNotFound();

    expect(container.textContent).toContain("Page not found");

    act(() => {
      root.unmount();
    });
  });

  it('renders dashboard link pointing to "/"', () => {
    const { container, root } = renderNotFound();

    const link = container.querySelector('a[href="/"]');
    expect(link?.textContent).toBe("Go back to dashboard");

    act(() => {
      root.unmount();
    });
  });
});
