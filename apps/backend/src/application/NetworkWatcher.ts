import type { Logger } from "pino";
import type { EventBus } from "../core/eventBus.js";
import type { ProfileStore } from "../config/store/ProfileStore.js";
import type { ServiceLifecycle } from "./ServiceLifecycle.js";
import {
  signaturesEqual,
  type NetworkDetector,
  type NetworkSignature,
} from "../infra/net/gatewayDetect.js";

export interface NetworkWatcherOptions {
  detector: NetworkDetector;
  profiles: ProfileStore;
  lifecycle: Pick<ServiceLifecycle, "switchActiveProfile">;
  bus: EventBus;
  logger: Logger;
  intervalMs?: number;
  // Injectable timers for tests; default to global setInterval/clearInterval.
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

export interface NetworkWatcher {
  start(): void;
  stop(): Promise<void>;
  /** Run one detection cycle. Exposed for the initial boot tick and for tests. */
  tick(): Promise<void>;
}

function matchProfileId(
  profiles: ReadonlyArray<{
    id: string;
    networkSigs: { gatewayMac?: string }[];
  }>,
  gatewayMac: string
): string | undefined {
  const mac = gatewayMac.toLowerCase();
  const found = profiles.find((p) =>
    p.networkSigs.some((s) => s.gatewayMac?.toLowerCase() === mac)
  );
  return found?.id;
}

export function createNetworkWatcher(
  opts: NetworkWatcherOptions
): NetworkWatcher {
  const { detector, profiles, lifecycle, bus, logger } = opts;
  const intervalMs = opts.intervalMs ?? 45_000;
  const setIntervalFn = opts.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const clearIntervalFn =
    opts.clearInterval ?? ((h) => clearInterval(h as NodeJS.Timeout));

  let handle: unknown;
  let inFlight: Promise<void> | undefined;

  async function runTick(): Promise<void> {
    const sig = await detector.detect();
    const last = await profiles.getLastSignature();
    // Unchanged network → do nothing. This is also what makes a manual switch
    // "stick": a manual switch leaves lastSignature alone, so the watcher won't
    // revert it until the LAN actually changes.
    if (signaturesEqual(sig, last)) return;
    // A missing reading is not a network change: no default route at all, or
    // the same gateway IP whose MAC the ARP lookup missed this time. Recording
    // it would make the next full reading look like a change and revert a
    // manual switch on an unchanged LAN.
    if (!sig.gatewayIp && !sig.gatewayMac) return;
    if (
      !sig.gatewayMac &&
      last?.gatewayMac &&
      sig.gatewayIp === last.gatewayIp
    ) {
      return;
    }

    if (!sig.gatewayMac) {
      // Can't reliably identify the network; never auto-switch on a weak signal.
      logger.debug(
        { signature: sig },
        "network changed but no gateway MAC; not auto-switching"
      );
      await profiles.setLastSignature(sig);
      return;
    }

    const list = await profiles.listProfiles();
    const matchId = matchProfileId(list, sig.gatewayMac);
    const activeId = await profiles.getActiveProfileId();

    if (!matchId) {
      logger.info(
        { signature: redact(sig) },
        "network unrecognized; staying on current profile"
      );
      await profiles.setLastSignature(sig);
      bus.emit("profile.network.unrecognized", { signature: sig });
      return;
    }

    const autoSwitch = await profiles.getAutoSwitch();
    if (autoSwitch && matchId !== activeId) {
      logger.info(
        { from: activeId, to: matchId, signature: redact(sig) },
        "auto-switching active profile for detected network"
      );
      await lifecycle.switchActiveProfile(matchId, "auto");
    }
    // Record the signature only once it has been acted on, so a failed switch
    // is retried on the next tick instead of being treated as handled.
    await profiles.setLastSignature(sig);
  }

  async function tick(): Promise<void> {
    if (inFlight) return; // never overlap detection cycles
    inFlight = runTick()
      .catch((err: unknown) => {
        logger.warn({ err }, "network detection tick failed");
      })
      .finally(() => {
        inFlight = undefined;
      });
    await inFlight;
  }

  return {
    start(): void {
      if (handle !== undefined) return;
      // Initial tick on boot, then on the interval.
      void tick();
      handle = setIntervalFn(() => void tick(), intervalMs);
      (handle as { unref?: () => void })?.unref?.();
    },
    async stop(): Promise<void> {
      if (handle !== undefined) {
        clearIntervalFn(handle);
        handle = undefined;
      }
      // Let an in-flight tick finish so it cannot switch profiles (and bring
      // services back up) after shutdown has moved on.
      await inFlight;
    },
    tick,
  };
}

// Avoid logging the full MAC at info level; keep a short prefix for debugging.
function redact(sig: NetworkSignature): Record<string, unknown> {
  return {
    gatewayMacPrefix: sig.gatewayMac
      ? `${sig.gatewayMac.slice(0, 8)}…`
      : undefined,
    subnet: sig.subnet,
  };
}
