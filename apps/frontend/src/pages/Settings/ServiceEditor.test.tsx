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
  {
    kind: "router",
    label: "Router",
    fields: [
      { name: "instanceId", label: "Instance ID", type: "text", required: true, default: "main" },
      { name: "enabled", label: "Enabled", type: "boolean", default: true },
      { name: "host", label: "Host", type: "text", required: true },
      { name: "ports", label: "Ports", type: "numberArray" },
      { name: "interfaceFilter", label: "Interface filter", type: "stringArray" },
    ],
    secretFields: [],
  },
  {
    kind: "philipsBridge",
    label: "Philips Hue Bridge",
    fields: [
      { name: "instanceId", label: "Instance ID", type: "text", required: true, default: "main" },
      { name: "enabled", label: "Enabled", type: "boolean", default: true },
      { name: "host", label: "Host", type: "text", required: true },
      { name: "applicationKey", label: "Application key", type: "password", secret: true },
      { name: "certHash", label: "Cert SHA-256", type: "text" },
    ],
    secretFields: ["applicationKey"],
  },
];

const { pairMock } = vi.hoisted(() => ({ pairMock: vi.fn() }));

vi.mock("./useConfigQueries", () => ({
  useKinds: () => ({ data: KINDS, isLoading: false }),
  useTestService: () => ({ mutateAsync: vi.fn() }),
  usePairPhilipsBridge: () => ({ mutateAsync: pairMock, isPending: false }),
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

function getFieldInput(container: HTMLElement, label: RegExp): HTMLInputElement {
  for (const lab of container.querySelectorAll("label")) {
    if (label.test(lab.textContent ?? "")) {
      const input = lab.querySelector("input") as HTMLInputElement | null;
      if (input) return input;
    }
  }
  throw new Error(`Input ${label} not found`);
}

describe("ServiceEditor list fields", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    document.body.innerHTML = "";
  });

  it("keeps a typed comma so a second item can be entered", async () => {
    const { container, cleanup } = await render({ presetKind: "router", hideKind: true });
    const ports = getFieldInput(container, /^Ports/);

    await typeInto(ports, "80,");
    expect(ports.value).toBe("80,");
    await typeInto(ports, "80, ");
    expect(ports.value).toBe("80, ");

    await cleanup();
  });

  it("submits list fields parsed into arrays when adding a service", async () => {
    const onSubmit = vi.fn<(input: ServiceInstanceInput) => Promise<void>>(async () => {});
    const { container, cleanup } = await render({
      presetKind: "router",
      hideKind: true,
      onSubmit,
    });

    await typeInto(getFieldInput(container, /^Host/), "192.168.1.1");
    await typeInto(getFieldInput(container, /^Ports/), "80, 443,");
    await typeInto(getFieldInput(container, /^Interface filter/), "eth0,eth1");

    await act(async () => {
      getSubmitButton(container).click();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0]![0] as ServiceInstanceInput;
    expect(payload.kind).toBe("router");
    expect(payload.config).toEqual({
      host: "192.168.1.1",
      ports: [80, 443],
      interfaceFilter: ["eth0", "eth1"],
    });

    await cleanup();
  });

  it("omits an empty optional list field", async () => {
    const onSubmit = vi.fn<(input: ServiceInstanceInput) => Promise<void>>(async () => {});
    const { container, cleanup } = await render({
      presetKind: "router",
      hideKind: true,
      onSubmit,
    });

    await typeInto(getFieldInput(container, /^Host/), "10.0.0.1");
    await act(async () => {
      getSubmitButton(container).click();
    });

    const payload = onSubmit.mock.calls[0]![0] as ServiceInstanceInput;
    expect(payload.config).toEqual({ host: "10.0.0.1" });

    await cleanup();
  });
});

describe("ServiceEditor Hue pairing", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    pairMock.mockReset();
  });

  afterEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    document.body.innerHTML = "";
  });

  function getPairButton(container: HTMLElement): HTMLButtonElement {
    const btn = Array.from(container.querySelectorAll("button")).find((b) =>
      /pair with bridge/i.test(b.textContent ?? ""),
    );
    if (!btn) throw new Error("Pair button not found");
    return btn;
  }

  it("offers pairing only for a Hue bridge", async () => {
    const router = await render({ presetKind: "router", hideKind: true });
    expect(() => getPairButton(router.container)).toThrow();
    await router.cleanup();
  });

  it("fills the key and cert pin from the bridge and saves them", async () => {
    pairMock.mockResolvedValue({ applicationKey: "hue-key", certHash: "ab".repeat(32) });
    const onSubmit = vi.fn<(input: ServiceInstanceInput) => Promise<void>>(async () => {});
    const { container, cleanup } = await render({
      presetKind: "philipsBridge",
      hideKind: true,
      onSubmit,
    });

    await typeInto(getFieldInput(container, /^Host/), "192.168.1.50");
    await act(async () => {
      getPairButton(container).click();
    });

    expect(pairMock).toHaveBeenCalledWith("192.168.1.50");
    expect(getFieldInput(container, /^Cert SHA-256/).value).toBe("ab".repeat(32));
    expect(container.querySelector('[data-testid="pair-result"]')?.textContent).toMatch(/paired/i);

    await act(async () => {
      getSubmitButton(container).click();
    });
    const payload = onSubmit.mock.calls[0]![0] as ServiceInstanceInput;
    expect(payload.config).toMatchObject({
      host: "192.168.1.50",
      applicationKey: "hue-key",
      certHash: "ab".repeat(32),
    });

    await cleanup();
  });

  it("shows the bridge error when the link button was not pressed", async () => {
    pairMock.mockRejectedValue(new Error("link button not pressed"));
    const { container, cleanup } = await render({ presetKind: "philipsBridge", hideKind: true });

    await typeInto(getFieldInput(container, /^Host/), "192.168.1.50");
    await act(async () => {
      getPairButton(container).click();
    });

    expect(container.querySelector('[data-testid="pair-result"]')?.textContent).toMatch(
      /link button/i,
    );
    await cleanup();
  });
});
