import { describe, it, expect, vi } from "vitest";
import pino from "pino";
import { createEventBus, type EventMap } from "../core/eventBus.js";
import { createNetworkWatcher } from "./NetworkWatcher.js";
import type {
  NetworkDetector,
  NetworkSignature,
} from "../infra/net/gatewayDetect.js";
import type { ProfileStore } from "../config/store/ProfileStore.js";
import type { ServiceLifecycle } from "./ServiceLifecycle.js";

const silentLogger = pino({ level: "silent" });

interface FakeProfileState {
  active: string | undefined;
  autoSwitch: boolean;
  lastSig: NetworkSignature | undefined;
  profiles: Array<{ id: string; networkSigs: { gatewayMac?: string }[] }>;
}

function makeProfiles(state: FakeProfileState): ProfileStore {
  return {
    listProfiles: async () => state.profiles as never,
    getProfile: async () => undefined,
    createProfile: async () => {
      throw new Error("nu");
    },
    updateProfile: async () => {
      throw new Error("nu");
    },
    deleteProfile: async () => {},
    serviceCounts: async () => ({}),
    getActiveProfileId: async () => state.active,
    setActiveProfileId: async (id: string) => {
      state.active = id;
    },
    getAutoSwitch: async () => state.autoSwitch,
    setAutoSwitch: async (v: boolean) => {
      state.autoSwitch = v;
    },
    getLastSignature: async () => state.lastSig,
    setLastSignature: async (s: NetworkSignature | undefined) => {
      state.lastSig = s;
    },
    ensureBootstrap: async () => {},
  } as unknown as ProfileStore;
}

function makeDetector(sig: NetworkSignature): NetworkDetector {
  return { detect: async () => sig };
}

function makeLifecycle(): {
  lifecycle: Pick<ServiceLifecycle, "switchActiveProfile">;
  calls: Array<[string, string | undefined]>;
} {
  const calls: Array<[string, string | undefined]> = [];
  return {
    calls,
    lifecycle: {
      switchActiveProfile: vi.fn(
        async (id: string, reason?: "manual" | "auto") => {
          calls.push([id, reason]);
        }
      ),
    },
  };
}

describe("NetworkWatcher.tick", () => {
  it("auto-switches to the profile matching the detected gateway MAC", async () => {
    const state: FakeProfileState = {
      active: "home",
      autoSwitch: true,
      lastSig: { gatewayMac: "home-mac" },
      profiles: [
        { id: "home", networkSigs: [{ gatewayMac: "home-mac" }] },
        { id: "office", networkSigs: [{ gatewayMac: "office-mac" }] },
      ],
    };
    const { lifecycle, calls } = makeLifecycle();
    const watcher = createNetworkWatcher({
      detector: makeDetector({ gatewayMac: "office-mac" }),
      profiles: makeProfiles(state),
      lifecycle,
      bus: createEventBus(),
      logger: silentLogger,
    });

    await watcher.tick();
    expect(calls).toEqual([["office", "auto"]]);
    expect(state.lastSig?.gatewayMac).toBe("office-mac");
  });

  it("does not switch when auto-switch is disabled", async () => {
    const state: FakeProfileState = {
      active: "home",
      autoSwitch: false,
      lastSig: { gatewayMac: "home-mac" },
      profiles: [{ id: "office", networkSigs: [{ gatewayMac: "office-mac" }] }],
    };
    const { lifecycle, calls } = makeLifecycle();
    const watcher = createNetworkWatcher({
      detector: makeDetector({ gatewayMac: "office-mac" }),
      profiles: makeProfiles(state),
      lifecycle,
      bus: createEventBus(),
      logger: silentLogger,
    });

    await watcher.tick();
    expect(calls).toEqual([]);
  });

  it("emits profile.network.unrecognized and stays put on no match", async () => {
    const state: FakeProfileState = {
      active: "home",
      autoSwitch: true,
      lastSig: { gatewayMac: "home-mac" },
      profiles: [{ id: "home", networkSigs: [{ gatewayMac: "home-mac" }] }],
    };
    const { lifecycle, calls } = makeLifecycle();
    const bus = createEventBus();
    const events: EventMap["profile.network.unrecognized"][] = [];
    bus.on("profile.network.unrecognized", (p) => events.push(p));

    const watcher = createNetworkWatcher({
      detector: makeDetector({ gatewayMac: "cafe-mac" }),
      profiles: makeProfiles(state),
      lifecycle,
      bus,
      logger: silentLogger,
    });

    await watcher.tick();
    expect(calls).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]!.signature.gatewayMac).toBe("cafe-mac");
  });

  it("is a no-op when the signature is unchanged (manual override sticks)", async () => {
    // Detected network maps to 'office' but lastSig already equals it and the
    // user manually moved to 'home' — the watcher must not revert.
    const state: FakeProfileState = {
      active: "home",
      autoSwitch: true,
      lastSig: { gatewayMac: "office-mac" },
      profiles: [{ id: "office", networkSigs: [{ gatewayMac: "office-mac" }] }],
    };
    const { lifecycle, calls } = makeLifecycle();
    const watcher = createNetworkWatcher({
      detector: makeDetector({ gatewayMac: "office-mac" }),
      profiles: makeProfiles(state),
      lifecycle,
      bus: createEventBus(),
      logger: silentLogger,
    });

    await watcher.tick();
    expect(calls).toEqual([]);
  });

  it("does not switch when the match is already active", async () => {
    const state: FakeProfileState = {
      active: "office",
      autoSwitch: true,
      lastSig: { gatewayMac: "home-mac" },
      profiles: [{ id: "office", networkSigs: [{ gatewayMac: "office-mac" }] }],
    };
    const { lifecycle, calls } = makeLifecycle();
    const watcher = createNetworkWatcher({
      detector: makeDetector({ gatewayMac: "office-mac" }),
      profiles: makeProfiles(state),
      lifecycle,
      bus: createEventBus(),
      logger: silentLogger,
    });

    await watcher.tick();
    expect(calls).toEqual([]);
  });
});
