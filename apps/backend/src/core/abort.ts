import { TimeoutError } from './errors.js';

export function linkAbort(...signals: Array<AbortSignal | undefined>): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

export function withTimeout(ms: number, parent?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new TimeoutError(`aborted after ${ms}ms`)), ms);
  if (parent) {
    if (parent.aborted) {
      clearTimeout(timer);
      controller.abort(parent.reason);
    } else {
      parent.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          controller.abort(parent.reason);
        },
        { once: true },
      );
    }
  }
  return controller.signal;
}
