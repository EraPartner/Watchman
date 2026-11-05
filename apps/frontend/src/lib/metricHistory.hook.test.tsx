// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createElement as h } from "react";
import {
  useMetricSeries,
  recordStats,
  _resetMetricHistoryForTests,
} from "./metricHistory";
import { actAsync } from "@/test/actAsync";
import { required } from "@/test/required";

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  _resetMetricHistoryForTests();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = false;
  document.body.innerHTML = "";
});

async function render(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await actAsync(() => root.render(element));
  return { container, root };
}

describe("useMetricSeries", () => {
  it("returns empty array initially when no data has been recorded", async () => {
    let captured: ReadonlyArray<{ t: number; v: number }> = [];

    function Consumer() {
      captured = useMetricSeries("bitcoin", "main", "blocks");
      return h("span", {}, String(captured.length));
    }

    const { root } = await render(<Consumer />);
    expect(captured).toHaveLength(0);
    act(() => root.unmount());
  });

  it("returns recorded samples", async () => {
    recordStats("tor", "main", { bw: 500 }, ["bw"], 1001);
    let captured: ReadonlyArray<{ t: number; v: number }> = [];

    function Consumer() {
      captured = useMetricSeries("tor", "main", "bw");
      return h("span", {}, String(captured.length));
    }

    const { root } = await render(<Consumer />);
    expect(captured).toHaveLength(1);
    expect(required(captured[0]).v).toBe(500);
    act(() => root.unmount());
  });

  it("re-renders when new samples are recorded", async () => {
    let renderCount = 0;
    let captured: ReadonlyArray<{ t: number; v: number }> = [];

    function Consumer() {
      renderCount++;
      captured = useMetricSeries("router", "home", "latency");
      return h("span", {}, String(captured.length));
    }

    const { root } = await render(<Consumer />);
    const initialCount = renderCount;
    expect(captured).toHaveLength(0);

    await actAsync(() => {
      recordStats("router", "home", { latency: 42 }, ["latency"], 2000);
    });

    expect(renderCount).toBeGreaterThan(initialCount);
    expect(captured).toHaveLength(1);
    expect(required(captured[0]).v).toBe(42);
    act(() => root.unmount());
  });
});
