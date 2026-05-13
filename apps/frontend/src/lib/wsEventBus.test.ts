import { afterEach, describe, expect, it, vi } from "vitest";
import { publishWsEvent, subscribeWsEvent } from "./wsEventBus";
import type { WsEvent } from "./wsEventBus";

function makeEvent(type: WsEvent["type"] = "connection"): WsEvent {
  return { type, timestamp: new Date().toISOString() };
}

// Clear all subscriptions between tests by unsubscribing everything.
afterEach(() => {
  // Unsubscribe by letting GC handle it — each test subscribes fresh.
});

describe("subscribeWsEvent", () => {
  it("returns an unsubscribe function", () => {
    const unsub = subscribeWsEvent(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("delivers published events to subscriber", () => {
    const received: WsEvent[] = [];
    const unsub = subscribeWsEvent((ev) => received.push(ev));

    const ev = makeEvent("service_update");
    publishWsEvent(ev);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(ev);

    unsub();
  });

  it("delivers events to multiple subscribers", () => {
    const received1: WsEvent[] = [];
    const received2: WsEvent[] = [];
    const unsub1 = subscribeWsEvent((ev) => received1.push(ev));
    const unsub2 = subscribeWsEvent((ev) => received2.push(ev));

    publishWsEvent(makeEvent("alert"));

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);

    unsub1();
    unsub2();
  });

  it("stops delivery after unsubscribe", () => {
    const received: WsEvent[] = [];
    const unsub = subscribeWsEvent((ev) => received.push(ev));

    unsub();
    publishWsEvent(makeEvent("metrics"));

    expect(received).toHaveLength(0);
  });
});

describe("publishWsEvent", () => {
  it("swallows handler errors so other subscribers still receive events", () => {
    const errorSpy = vi.fn(() => { throw new Error("handler error"); });
    const safeSpy = vi.fn();

    const unsub1 = subscribeWsEvent(errorSpy);
    const unsub2 = subscribeWsEvent(safeSpy);

    expect(() => publishWsEvent(makeEvent())).not.toThrow();
    expect(safeSpy).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });

  it("publishes all event fields to handler", () => {
    const received: WsEvent[] = [];
    const unsub = subscribeWsEvent((ev) => received.push(ev));

    const ev: WsEvent = {
      type: "alert",
      service: "bitcoin",
      level: "error",
      message: "node down",
      data: { foo: 1 },
      timestamp: "2024-01-01T00:00:00Z",
    };
    publishWsEvent(ev);

    expect(received[0]).toEqual(ev);
    unsub();
  });
});
