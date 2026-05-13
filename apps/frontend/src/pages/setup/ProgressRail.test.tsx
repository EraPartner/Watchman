// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProgressRail } from "./ProgressRail";

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  document.body.innerHTML = "";
});

async function render(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return { container, root };
}

describe("ProgressRail", () => {
  it("renders all four step labels", async () => {
    const { container, root } = await render(<ProgressRail step="welcome" />);
    expect(container.textContent).toContain("Welcome");
    expect(container.textContent).toContain("Pick");
    expect(container.textContent).toContain("Configure");
    expect(container.textContent).toContain("Review");
    act(() => root.unmount());
  });

  it("marks current step as active", async () => {
    const { container, root } = await render(<ProgressRail step="pick" />);
    const items = container.querySelectorAll("[data-status]");
    const statuses = Array.from(items).map((el) => el.getAttribute("data-status"));
    expect(statuses).toContain("active");
    expect(statuses).toContain("done");
    expect(statuses).toContain("todo");
    act(() => root.unmount());
  });

  it("marks all steps as done except last when step=review", async () => {
    const { container, root } = await render(<ProgressRail step="review" />);
    const items = container.querySelectorAll("[data-status]");
    const statuses = Array.from(items).map((el) => el.getAttribute("data-status"));
    expect(statuses.filter((s) => s === "done")).toHaveLength(3);
    expect(statuses.filter((s) => s === "active")).toHaveLength(1);
    act(() => root.unmount());
  });

  it("marks all steps as todo except first when step=welcome", async () => {
    const { container, root } = await render(<ProgressRail step="welcome" />);
    const items = container.querySelectorAll("[data-status]");
    const statuses = Array.from(items).map((el) => el.getAttribute("data-status"));
    expect(statuses.filter((s) => s === "todo")).toHaveLength(3);
    expect(statuses[0]).toBe("active");
    act(() => root.unmount());
  });

  it("has accessible nav landmark", async () => {
    const { container, root } = await render(<ProgressRail step="configure" />);
    const nav = container.querySelector("nav");
    expect(nav?.getAttribute("aria-label")).toBe("Setup progress");
    act(() => root.unmount());
  });
});
