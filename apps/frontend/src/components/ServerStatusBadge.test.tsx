// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock("lucide-react", () => ({
  AlertCircle: () => <span />,
  CheckCircle: () => <span />,
  RefreshCw: () => <span />,
  Wifi: () => <span />,
}));

import { ServerStatusBadge } from "./ServerStatusBadge";

async function renderStatus(
  status: React.ComponentProps<typeof ServerStatusBadge>["status"]
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<ServerStatusBadge status={status} />);
  });

  return { container, root };
}

describe("ServerStatusBadge", () => {
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

  it.each([
    ["loading", "Loading"],
    ["online", "Online"],
    ["warning", "Warning"],
    ["error", "Error"],
    ["maintenance", "Maintenance"],
    ["offline", "Offline"],
  ] as const)("renders %s label", async (status, label) => {
    const { container, root } = await renderStatus(status);
    expect(container.textContent).toContain(label);
    act(() => root.unmount());
  });
});
