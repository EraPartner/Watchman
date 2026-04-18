export type Handler<T> = (payload: T) => void | Promise<void>;

export interface EventMap {
  'service.health.updated': { id: string; kind: string; instanceId: string; at: number };
  'service.stats.updated': { id: string; kind: string; instanceId: string; at: number };
  'service.error': { id: string; error: unknown; at: number };
}

type EventKey = keyof EventMap;

export interface EventBus {
  emit<K extends EventKey>(event: K, payload: EventMap[K]): void;
  on<K extends EventKey>(event: K, handler: Handler<EventMap[K]>): () => void;
}

export function createEventBus(onError?: (err: unknown) => void): EventBus {
  const handlers = new Map<EventKey, Set<Handler<unknown>>>();

  return {
    emit(event, payload) {
      const set = handlers.get(event);
      if (!set) return;
      for (const h of set) {
        try {
          const maybe = (h as Handler<typeof payload>)(payload);
          if (maybe instanceof Promise) maybe.catch((e) => onError?.(e));
        } catch (e) {
          onError?.(e);
        }
      }
    },
    on(event, handler) {
      let set = handlers.get(event);
      if (!set) {
        set = new Set();
        handlers.set(event, set);
      }
      set.add(handler as Handler<unknown>);
      return () => set!.delete(handler as Handler<unknown>);
    },
  };
}
