// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  KindSchema,
  ServiceInstance,
  ServiceInstanceInput,
} from "../../services/configApi";

const KINDS: KindSchema[] = [
  {
    kind: "ipfs",
    label: "IPFS",
    fields: [
      { name: "instanceId", label: "Instance ID", type: "text", required: true, default: "main" },
      { name: "enabled", label: "Enabled", type: "boolean", default: true },
      { name: "cacheTtlMs", label: "Cache TTL (ms)", type: "number", default: 10_000 },
      { name: "timeoutMs", label: "Timeout (ms)", type: "number", default: 5_000 },
      { name: "apiUrl", label: "API URL", type: "url", required: true, default: "http://127.0.0.1:5001" },
    ],
    secretFields: [],
  },
];

vi.mock("./useConfigQueries", () => ({
  useKinds: () => ({ data: KINDS, isLoading: false }),
  useTestService: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../../components/primitives", async () => {
  const React = await import("react");
  return {
    Button: ({
      children,
      onClick,
      disabled,
      type,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      disabled?: boolean;
      type?: "button" | "submit";
    }) =>
      React.createElement(
        "button",
        { onClick, disabled, type: type ?? "button", "data-testid": type === "submit" ? "submit-btn" : undefined },
        children,
      ),
  };
});

const ServiceEditor = (await import("./ServiceEditor")).default;

const existingService: ServiceInstance = {
  id: "ipfs-1",
  kind: "ipfs",
  instanceId: "primary",
  enabled: true,
  config: { kind: "ipfs", instanceId: "primary", enabled: true, apiUrl: "http://127.0.0.1:5001" },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

async function render(props: Partial<React.ComponentProps<typeof ServiceEditor>> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onSubmit =
    props.onSubmit ?? vi.fn<(input: ServiceInstanceInput) => Promise<void>>(async () => {});
  const onCancel = props.onCancel ?? vi.fn();
  await act(async () => {
    root.render(
      <ServiceEditor
        existing={props.existing}
        presetKind={props.presetKind}
        hideKind={props.hideKind}
        hideCancel={props.hideCancel}
        onSubmit={onSubmit}
        onCancel={onCancel}
        submitting={props.submitting}
      />,
    );
  });
  return {
    container,
    onSubmit,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function getInstanceIdInput(container: HTMLElement): HTMLInputElement {
  const labels = container.querySelectorAll("label");
  for (const lab of labels) {
    if (/instance id/i.test(lab.textContent ?? "")) {
      const input = lab.querySelector("input") as HTMLInputElement | null;
      if (input) return input;
    }
  }
  throw new Error("Instance id input not found");
}

function getSubmitButton(container: HTMLElement): HTMLButtonElement {
  const btn = container.querySelector('[data-testid="submit-btn"]') as HTMLButtonElement | null;
  if (!btn) throw new Error("Submit button not found");
  return btn;
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

describe("ServiceEditor instance id rename", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    document.body.innerHTML = "";
  });

  it("enables the instance id input in edit mode", async () => {
    const { container, cleanup } = await render({ existing: existingService });
    const input = getInstanceIdInput(container);
    expect(input.disabled).toBe(false);
    expect(input.value).toBe("primary");
    await cleanup();
  });

  it("shows inline error and disables submit on invalid id (uppercase)", async () => {
    const { container, cleanup } = await render({ existing: existingService });
    const input = getInstanceIdInput(container);
    await typeInto(input, "BadID");

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent ?? "").toMatch(/lowercase/i);

    const submit = getSubmitButton(container);
    expect(submit.disabled).toBe(true);

    await cleanup();
  });

  it("shows inline error and disables submit on empty id", async () => {
    const { container, cleanup } = await render({ existing: existingService });
    const input = getInstanceIdInput(container);
    await typeInto(input, "");

    const submit = getSubmitButton(container);
    expect(submit.disabled).toBe(true);

    await cleanup();
  });

  it("shows rename hint when instance id changes from existing", async () => {
    const { container, cleanup } = await render({ existing: existingService });
    const input = getInstanceIdInput(container);

    // No hint initially (same as existing.instanceId).
    expect(container.querySelector('[data-testid="rename-hint"]')).toBeNull();

    await typeInto(input, "renamed");

    const hint = container.querySelector('[data-testid="rename-hint"]');
    expect(hint).not.toBeNull();
    expect(hint?.textContent ?? "").toMatch(/reset.*metric history/i);

    await cleanup();
  });

  it("does not show rename hint when id matches existing", async () => {
    const { container, cleanup } = await render({ existing: existingService });
    const input = getInstanceIdInput(container);
    await typeInto(input, "primary");
    expect(container.querySelector('[data-testid="rename-hint"]')).toBeNull();
    await cleanup();
  });

  it("submits with the new instance id when renaming", async () => {
    const onSubmit = vi.fn<(input: ServiceInstanceInput) => Promise<void>>(async () => {});
    const { container, cleanup } = await render({ existing: existingService, onSubmit });
    const input = getInstanceIdInput(container);
    await typeInto(input, "renamed");

    const submit = getSubmitButton(container);
    expect(submit.disabled).toBe(false);

    await act(async () => {
      submit.click();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0]![0] as ServiceInstanceInput;
    expect(payload.instanceId).toBe("renamed");
    expect(payload.kind).toBe("ipfs");

    await cleanup();
  });
});
