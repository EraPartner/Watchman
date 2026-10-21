// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "../../services/profilesApi";

const PROFILE: Profile = {
  id: "p1",
  name: "Home",
  description: "Home LAN services",
  color: "#3b82f6",
  networkSigs: [],
  serviceCount: 0,
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const updateMutateAsync = vi.fn(async (_vars: unknown) => PROFILE);
const createMutateAsync = vi.fn(async (_vars: unknown) => PROFILE);

function mutation(mutateAsync: (vars: never) => Promise<unknown> = vi.fn(async () => undefined)) {
  return { mutate: vi.fn(), mutateAsync, isPending: false };
}

vi.mock("./useProfileQueries", () => ({
  useProfiles: () => ({ data: [PROFILE], isLoading: false, error: null }),
  useActiveProfile: () => ({ data: { activeProfileId: "p1", autoSwitch: true } }),
  useCurrentNetwork: () => ({ data: undefined }),
  useCreateProfile: () => mutation(createMutateAsync),
  useUpdateProfile: () => mutation(updateMutateAsync),
  useDeleteProfile: () => mutation(),
  useSetActiveProfile: () => mutation(),
  useSetAutoSwitch: () => mutation(),
  useCaptureNetwork: () => mutation(),
}));

vi.mock("./SettingsLayout", async () => {
  const React = await import("react");
  return {
    SettingsLayout: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
  };
});

vi.mock("../../components/primitives", async () => {
  const React = await import("react");
  return {
    Button: ({
      children,
      onClick,
      type,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      type?: "button" | "submit";
    }) => React.createElement("button", { onClick, type: type ?? "button" }, children),
    Badge: ({ children }: { children: React.ReactNode }) =>
      React.createElement("span", null, children),
    StatusDot: () => null,
    Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? React.createElement("div", null, children) : null,
    DialogContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
    DialogTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement("h2", null, children),
    ConfirmDialog: () => null,
  };
});

const Profiles = (await import("./Profiles")).default;

function buttonByText(root: HTMLElement, text: string): HTMLButtonElement {
  const btn = Array.from(root.querySelectorAll("button")).find(
    (b) => b.textContent === text,
  );
  if (!btn) throw new Error(`button "${text}" not found`);
  return btn as HTMLButtonElement;
}

function inputByLabel(root: HTMLElement, label: RegExp): HTMLInputElement {
  for (const lab of root.querySelectorAll("label")) {
    if (label.test(lab.textContent ?? "")) {
      const input = lab.querySelector("input");
      if (input) return input as HTMLInputElement;
    }
  }
  throw new Error(`input ${label} not found`);
}

async function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("Profiles editor", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
  });

  afterEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    document.body.innerHTML = "";
  });

  it("sends an emptied description so the backend clears it", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<Profiles />));

    await act(async () => buttonByText(container, "Edit").click());
    await typeInto(inputByLabel(container, /description/i), "");
    await act(async () => buttonByText(container, "Save").click());

    expect(updateMutateAsync).toHaveBeenCalledTimes(1);
    const arg = updateMutateAsync.mock.calls[0]![0] as {
      id: string;
      patch: { description?: string };
    };
    expect(arg.id).toBe("p1");
    // Must survive JSON.stringify: an undefined key would be dropped and the
    // backend would keep the old description.
    expect(JSON.parse(JSON.stringify(arg.patch))).toHaveProperty("description", "");

    act(() => root.unmount());
  });
});
