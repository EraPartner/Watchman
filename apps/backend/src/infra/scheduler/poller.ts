import type { Logger } from "pino";
import type { Clock } from "../../core/clock.js";
import type { EventBus } from "../../core/eventBus.js";
import type { BaseService } from "../../domain/BaseService.js";
import { withTimeout } from "../../core/abort.js";

export interface PollerOptions {
  clock: Clock;
  bus: EventBus;
  logger: Logger;
  defaultTimeoutMs?: number;
}

export interface Poller {
  track(svc: BaseService): void;
  untrack(id: string): void;
  pause(): void;
  resume(): void;
  stop(): Promise<void>;
  isRunning(id: string): boolean;
  isPaused(): boolean;
}

type Task = { cancel: () => void };

export function createBackgroundPoller(opts: PollerOptions): Poller {
  const { clock, bus, logger } = opts;
  const timeoutMs = opts.defaultTimeoutMs ?? 10_000;
  const tasks = new Map<string, Task[]>();
  const services = new Map<string, BaseService>();
  let paused = false;

  const jitter = (ms: number, ratio: number): number => {
    const delta = ms * ratio;
    return Math.max(10, ms + (Math.random() * 2 - 1) * delta);
  };

  const schedule = (
    svc: BaseService,
    intervalMs: number,
    runner: () => Promise<void>
  ): Task => {
    let cancelled = false;
    let cancelTimer: (() => void) | null = null;
    const ratio = svc.pollPolicy.jitterRatio ?? 0.1;

    const tick = async (): Promise<void> => {
      if (cancelled) return;
      if (!paused) {
        try {
          await runner();
        } catch (e) {
          logger.error({ err: e, id: svc.id }, "poller tick failed");
        }
      }
      if (cancelled) return;
      cancelTimer = clock.setTimeout(
        () => {
          void tick();
        },
        jitter(intervalMs, ratio)
      );
    };

    cancelTimer = clock.setTimeout(
      () => {
        void tick();
      },
      jitter(intervalMs, ratio)
    );

    return {
      cancel: () => {
        cancelled = true;
        cancelTimer?.();
      },
    };
  };

  return {
    track(svc) {
      if (tasks.has(svc.id)) return;
      services.set(svc.id, svc);
      const healthTask = schedule(svc, svc.pollPolicy.healthMs, async () => {
        const signal = withTimeout(timeoutMs);
        const res = await svc.checkHealth(signal);
        if (res.ok) {
          bus.emit("service.health.updated", {
            id: svc.id,
            kind: svc.kind,
            instanceId: svc.instanceId,
            at: clock.now(),
            snapshot: res.value,
          });
        } else {
          bus.emit("service.error", {
            id: svc.id,
            kind: svc.kind,
            instanceId: svc.instanceId,
            scope: "health",
            error: res.error,
            at: clock.now(),
          });
        }
      });
      const statsTask = schedule(svc, svc.pollPolicy.statsMs, async () => {
        const signal = withTimeout(timeoutMs);
        const res = await svc.getStats(signal);
        if (res.ok) {
          bus.emit("service.stats.updated", {
            id: svc.id,
            kind: svc.kind,
            instanceId: svc.instanceId,
            at: clock.now(),
            snapshot: res.value,
          });
        } else {
          bus.emit("service.error", {
            id: svc.id,
            kind: svc.kind,
            instanceId: svc.instanceId,
            scope: "stats",
            error: res.error,
            at: clock.now(),
          });
        }
      });
      tasks.set(svc.id, [healthTask, statsTask]);
    },
    untrack(id) {
      const list = tasks.get(id);
      if (!list) return;
      list.forEach((t) => t.cancel());
      tasks.delete(id);
      services.delete(id);
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    isPaused() {
      return paused;
    },
    isRunning(id) {
      return tasks.has(id);
    },
    async stop() {
      for (const list of tasks.values()) list.forEach((t) => t.cancel());
      tasks.clear();
      services.clear();
    },
  };
}
