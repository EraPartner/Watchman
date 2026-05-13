// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/" }),
  NavLink: ({ children, to }: { children: React.ReactNode; to: string }) =>
    h("a", { href: to }, children),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    h("a", { href: to }, children),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
  useMutation: vi.fn(() => ({
    mutateAsync: vi.fn(async () => ({ id: "test:main" })),
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  })),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("../../Settings/useConfigQueries", () => ({
  useKinds: vi.fn(() => ({
    data: [
      { kind: "tor", label: "Tor", description: "Tor relay node" },
      { kind: "router", label: "Router", description: "Router monitoring" },
    ],
    isLoading: false,
  })),
  useServices: vi.fn(() => ({
    data: [
      {
        id: "tor:main",
        kind: "tor",
        instanceId: "main",
        enabled: true,
        config: {},
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    ],
    isLoading: false,
  })),
  useCreateService: vi.fn(() => ({
    mutateAsync: vi.fn(async () => ({ id: "tor:main" })),
    isPending: false,
  })),
  useTestService: vi.fn(() => ({
    mutateAsync: vi.fn(async () => ({ ok: true })),
    isPending: false,
  })),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("../../../services/ApiClient", () => ({
  apiClient: { getAggregatedServices: vi.fn(async () => []) },
  sharedCore: { request: vi.fn(async () => ({})) },
}));

vi.mock("../../../services/configApi", () => ({
  configApi: {
    getKinds: vi.fn(async () => []),
    listServices: vi.fn(async () => []),
    createService: vi.fn(async () => ({ id: "tor:main" })),
    testService: vi.fn(async () => ({ ok: true })),
    getSetupStatus: vi.fn(async () => ({ needsSetup: false })),
  },
}));

vi.mock("../../Settings/ServiceEditor", () => ({
  default: ({ onCancel, onSubmit }: { onCancel?: () => void; onSubmit?: () => void }) =>
    h("form", { onSubmit: (e: Event) => { e.preventDefault(); onSubmit?.(); } },
      h("button", { type: "button", onClick: onCancel }, "Cancel"),
      h("button", { type: "submit" }, "Save"),
    ),
}));

vi.mock("../../../hooks/useSetupDismissal", () => ({
  useSetupDismissal: vi.fn(() => ({
    isDismissed: false,
    dismiss: vi.fn(),
    reset: vi.fn(),
  })),
}));

import { WelcomeStep } from "./WelcomeStep";
import { KindPickerStep } from "./KindPickerStep";
import { ReviewStep } from "./ReviewStep";
import { ConfigureStep } from "./ConfigureStep";
import SetupWizard from "../SetupWizard";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── WelcomeStep ──────────────────────────────────────────────────────────────

describe("WelcomeStep", () => {
  it("renders without crashing", async () => {
    const { container, root } = await render(
      <WelcomeStep onStart={vi.fn()} onSkip={vi.fn()} />
    );
    expect(container.firstChild).toBeTruthy();
    act(() => root.unmount());
  });

  it("renders heading text", async () => {
    const { container, root } = await render(
      <WelcomeStep onStart={vi.fn()} onSkip={vi.fn()} />
    );
    expect(container.textContent).toContain("Watchman");
    act(() => root.unmount());
  });

  it("renders Begin setup and Skip for now buttons", async () => {
    const { container, root } = await render(
      <WelcomeStep onStart={vi.fn()} onSkip={vi.fn()} />
    );
    expect(container.textContent).toContain("Begin setup");
    expect(container.textContent).toContain("Skip for now");
    act(() => root.unmount());
  });

  it("calls onStart when Begin setup clicked", async () => {
    const onStart = vi.fn();
    const { container, root } = await render(
      <WelcomeStep onStart={onStart} onSkip={vi.fn()} />
    );
    const btn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Begin setup")
    );
    await act(async () => btn?.click());
    expect(onStart).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("calls onSkip when skip button clicked", async () => {
    const onSkip = vi.fn();
    const { container, root } = await render(
      <WelcomeStep onStart={vi.fn()} onSkip={onSkip} />
    );
    const btn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Skip for now")
    );
    await act(async () => btn?.click());
    expect(onSkip).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});

// ─── KindPickerStep ───────────────────────────────────────────────────────────

describe("KindPickerStep", () => {
  it("renders without crashing", async () => {
    const { container, root } = await render(
      <KindPickerStep onSelect={vi.fn()} onBack={vi.fn()} />
    );
    expect(container.firstChild).toBeTruthy();
    act(() => root.unmount());
  });

  it("renders search input", async () => {
    const { container, root } = await render(
      <KindPickerStep onSelect={vi.fn()} onBack={vi.fn()} />
    );
    expect(container.querySelector("input[type='search']")).toBeTruthy();
    act(() => root.unmount());
  });

  it("renders kind cards from mocked data", async () => {
    const { container, root } = await render(
      <KindPickerStep onSelect={vi.fn()} onBack={vi.fn()} />
    );
    expect(container.textContent).toContain("Tor");
    act(() => root.unmount());
  });

  it("renders Back button", async () => {
    const { container, root } = await render(
      <KindPickerStep onSelect={vi.fn()} onBack={vi.fn()} />
    );
    const btns = Array.from(container.querySelectorAll("button"));
    expect(btns.some((b) => b.textContent?.includes("Back"))).toBe(true);
    act(() => root.unmount());
  });
});

// ─── ReviewStep ───────────────────────────────────────────────────────────────

describe("ReviewStep", () => {
  it("renders without crashing", async () => {
    const { container, root } = await render(
      <ReviewStep addedIds={[]} onAddAnother={vi.fn()} onFinish={vi.fn()} />
    );
    expect(container.firstChild).toBeTruthy();
    act(() => root.unmount());
  });

  it("shows 'Nothing added yet' when addedIds is empty", async () => {
    const { container, root } = await render(
      <ReviewStep addedIds={[]} onAddAnother={vi.fn()} onFinish={vi.fn()} />
    );
    expect(container.textContent).toContain("Nothing added yet");
    act(() => root.unmount());
  });

  it("shows configured count when addedIds matches services", async () => {
    const { container, root } = await render(
      <ReviewStep addedIds={["tor:main"]} onAddAnother={vi.fn()} onFinish={vi.fn()} />
    );
    expect(container.textContent).toContain("Configured");
    act(() => root.unmount());
  });

  it("renders Finish and Add another buttons", async () => {
    const { container, root } = await render(
      <ReviewStep addedIds={[]} onAddAnother={vi.fn()} onFinish={vi.fn()} />
    );
    expect(container.textContent).toContain("Finish");
    expect(container.textContent).toContain("Add another");
    act(() => root.unmount());
  });
});

// ─── ConfigureStep ────────────────────────────────────────────────────────────

describe("ConfigureStep", () => {
  it("renders without crashing", async () => {
    const { container, root } = await render(
      <ConfigureStep kind="tor" onDone={vi.fn()} onBack={vi.fn()} />
    );
    expect(container.firstChild).toBeTruthy();
    act(() => root.unmount());
  });

  it("shows the kind label", async () => {
    const { container, root } = await render(
      <ConfigureStep kind="tor" onDone={vi.fn()} onBack={vi.fn()} />
    );
    expect(container.textContent).toContain("Tor");
    act(() => root.unmount());
  });

  it("renders Back button", async () => {
    const { container, root } = await render(
      <ConfigureStep kind="tor" onDone={vi.fn()} onBack={vi.fn()} />
    );
    const btns = Array.from(container.querySelectorAll("button"));
    expect(btns.some((b) => b.textContent?.includes("Back"))).toBe(true);
    act(() => root.unmount());
  });
});

// ─── SetupWizard ──────────────────────────────────────────────────────────────

describe("SetupWizard", () => {
  it("renders without crashing on welcome step", async () => {
    const { container, root } = await render(<SetupWizard />);
    expect(container.firstChild).toBeTruthy();
    act(() => root.unmount());
  });

  it("renders Watchman brand", async () => {
    const { container, root } = await render(<SetupWizard />);
    expect(container.textContent).toContain("Watchman");
    act(() => root.unmount());
  });

  it("renders ProgressRail with welcome step active", async () => {
    const { container, root } = await render(<SetupWizard />);
    expect(container.textContent).toContain("Welcome");
    act(() => root.unmount());
  });

  it("navigates to pick step when Begin setup clicked", async () => {
    const { container, root } = await render(<SetupWizard />);
    const beginBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Begin setup")
    );
    await act(async () => beginBtn?.click());
    expect(container.textContent).toContain("Pick");
    act(() => root.unmount());
  });
});
