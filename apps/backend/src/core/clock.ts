export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): () => void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
};

export interface FakeClock extends Clock {
  advance(ms: number): void;
  set(ts: number): void;
}

export function createFakeClock(initial = 0): FakeClock {
  let current = initial;
  const timers: Array<{ at: number; fn: () => void; cancelled: boolean }> = [];

  return {
    now: () => current,
    setTimeout(fn, ms) {
      const entry = { at: current + ms, fn, cancelled: false };
      timers.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    set(ts) {
      this.advance(ts - current);
    },
    advance(ms) {
      const target = current + ms;
      for (;;) {
        const due = timers
          .filter((t) => !t.cancelled && t.at <= target)
          .sort((a, b) => a.at - b.at);
        if (due.length === 0) break;
        const next = due[0]!;
        current = next.at;
        next.cancelled = true;
        next.fn();
      }
      current = target;
    },
  };
}
