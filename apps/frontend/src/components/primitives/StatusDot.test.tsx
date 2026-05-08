// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StatusDot } from "./StatusDot";

// ---- helpers -----------------------------------------------------------

async function renderDot(props: React.ComponentProps<typeof StatusDot>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<StatusDot {...props} />);
  });
  return {
    el: container.querySelector('[role="status"]') as HTMLElement,
    cleanup: () => act(() => { root.unmount(); }),
  };
}

// ---- tests -------------------------------------------------------------

describe("StatusDot a11y — data-state attribute", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    document.body.innerHTML = "";
  });

  it("sets data-state='ok' when tone='ok'", async () => {
    const { el, cleanup } = await renderDot({ tone: "ok" });
    expect(el.getAttribute("data-state")).toBe("ok");
    await cleanup();
  });

  it("sets data-state='warn' when tone='warn'", async () => {
    const { el, cleanup } = await renderDot({ tone: "warn" });
    expect(el.getAttribute("data-state")).toBe("warn");
    await cleanup();
  });

  it("sets data-state='crit' when tone='crit'", async () => {
    const { el, cleanup } = await renderDot({ tone: "crit" });
    expect(el.getAttribute("data-state")).toBe("crit");
    await cleanup();
  });

  it("sets data-state='neutral' when tone='neutral'", async () => {
    const { el, cleanup } = await renderDot({ tone: "neutral" });
    expect(el.getAttribute("data-state")).toBe("neutral");
    await cleanup();
  });

  it("defaults data-state to 'ok' when tone is omitted", async () => {
    const { el, cleanup } = await renderDot({});
    expect(el.getAttribute("data-state")).toBe("ok");
    await cleanup();
  });
});
