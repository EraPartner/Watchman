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

/**
 * The timer is unref'd and, once it fires, the listener on `parent` is removed,
 * so a request that finishes early never keeps the process alive and a
 * long-lived parent signal does not collect one listener per call.
 */
export function withTimeout(ms: number, parent?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const onParentAbort = () => {
    clearTimeout(timer);
    controller.abort(parent?.reason);
  };
  const timer = setTimeout(() => {
    parent?.removeEventListener('abort', onParentAbort);
    controller.abort(new TimeoutError(`aborted after ${ms}ms`));
  }, ms);
  timer.unref?.();
  if (parent) {
    if (parent.aborted) {
      clearTimeout(timer);
      controller.abort(parent.reason);
    } else {
      parent.addEventListener('abort', onParentAbort, { once: true });
    }
  }
  return controller.signal;
}
