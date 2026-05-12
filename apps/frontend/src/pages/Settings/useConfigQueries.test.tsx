// @vitest-environment jsdom
/**
 * Verifies that the config mutation hooks invalidate the dashboard-facing query
 * families (`services/instances`, `services/health`) on success so a freshly
 * added, edited, or deleted service surfaces on the dashboard without a manual
 * refresh.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  useCreateService,
  useUpdateService,
  useDeleteService,
  useImportConfig,
} from "./useConfigQueries";
import type {
  ServiceInstance,
  ServiceInstanceInput,
  ImportResult,
  ExportBundle,
} from "../../services/configApi";

const { createServiceMock, updateServiceMock, deleteServiceMock, importConfigMock } =
  vi.hoisted(() => ({
    createServiceMock: vi.fn(),
    updateServiceMock: vi.fn(),
    deleteServiceMock: vi.fn(),
    importConfigMock: vi.fn(),
  }));

vi.mock("../../services/configApi", () => ({
  configApi: {
    createService: createServiceMock,
    updateService: updateServiceMock,
    deleteService: deleteServiceMock,
    importConfig: importConfigMock,
  },
}));

interface MutationApi {
  mutateAsync: (input: unknown) => Promise<unknown>;
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function renderHook<T>(useHook: () => T, qc: QueryClient): { result: { current: T }; unmount: () => void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const result: { current: T } = { current: undefined as unknown as T };

  function Probe() {
    result.current = useHook();
    return null;
  }

  act(() => {
    root.render(
      React.createElement(
        QueryClientProvider,
        { client: qc },
        React.createElement(Probe),
      ),
    );
  });

  return {
    result,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function makeFakeService(overrides: Partial<ServiceInstance> = {}): ServiceInstance {
  return {
    id: "stored-1",
    kind: "bitcoin",
    instanceId: "main",
    enabled: true,
    config: {} as unknown as Record<string, unknown>,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as ServiceInstance;
}

describe("useConfigQueries dashboard invalidation", () => {
  let qc: QueryClient;
  let invalidateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    vi.clearAllMocks();
  });

  afterEach(() => {
    qc.clear();
    document.body.innerHTML = "";
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("useCreateService invalidates services/instances and services/health on success", async () => {
    createServiceMock.mockResolvedValueOnce(makeFakeService());
    const { result, unmount } = renderHook(() => useCreateService(), qc);

    await act(async () => {
      await (result.current as unknown as MutationApi).mutateAsync({
        kind: "bitcoin",
        instanceId: "main",
        enabled: true,
        config: {},
      } as ServiceInstanceInput);
      await flushMicrotasks();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["services", "instances"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["services", "health"] });
    unmount();
  });

  it("useUpdateService invalidates services/instances and services/health on success", async () => {
    updateServiceMock.mockResolvedValueOnce(makeFakeService());
    const { result, unmount } = renderHook(() => useUpdateService(), qc);

    await act(async () => {
      await (result.current as unknown as MutationApi).mutateAsync({
        id: "stored-1",
        input: { instanceId: "renamed" },
      });
      await flushMicrotasks();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["services", "instances"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["services", "health"] });
    unmount();
  });

  it("useDeleteService invalidates services/instances and services/health on success", async () => {
    deleteServiceMock.mockResolvedValueOnce(undefined);
    const { result, unmount } = renderHook(() => useDeleteService(), qc);

    await act(async () => {
      await (result.current as unknown as MutationApi).mutateAsync("stored-1");
      await flushMicrotasks();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["services", "instances"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["services", "health"] });
    unmount();
  });

  it("useImportConfig invalidates services/instances and services/health on success", async () => {
    const fakeResult: ImportResult = { imported: 1, updated: 0, skipped: 0, errors: [] };
    importConfigMock.mockResolvedValueOnce(fakeResult);
    const { result, unmount } = renderHook(() => useImportConfig(), qc);

    const bundle: ExportBundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      payload: "{}",
    };

    await act(async () => {
      await (result.current as unknown as MutationApi).mutateAsync(bundle);
      await flushMicrotasks();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["services", "instances"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["services", "health"] });
    unmount();
  });
});
