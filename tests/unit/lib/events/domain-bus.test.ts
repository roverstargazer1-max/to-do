import { describe, it, expect, vi } from "vitest";
import {
  publishDomainEvent,
  subscribeToDomainEvents,
} from "@/lib/events/domain-bus";
import type { DomainEvent } from "@/lib/events/domain-event";

const makeEvent = (): DomainEvent => ({
  type: "task.completed",
  taskId: "task-1",
});

describe("domain event bus", () => {
  it("delivers published events synchronously to subscribers", () => {
    const seen: DomainEvent[] = [];
    const unsubscribe = subscribeToDomainEvents((event) => seen.push(event));

    const event = makeEvent();
    publishDomainEvent(event);

    // Synchronous delivery — no awaiting needed.
    expect(seen).toEqual([event]);

    unsubscribe();
  });

  it("stops delivery after unsubscribe", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToDomainEvents(handler);
    unsubscribe();

    publishDomainEvent(makeEvent());

    expect(handler).not.toHaveBeenCalled();
  });

  it("delivers to every subscriber independently", () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubFirst = subscribeToDomainEvents(first);
    const unsubSecond = subscribeToDomainEvents(second);

    const event = makeEvent();
    publishDomainEvent(event);

    expect(first).toHaveBeenCalledWith(event);
    expect(second).toHaveBeenCalledWith(event);

    unsubFirst();
    unsubSecond();
  });

  it("isolates a throwing subscriber so publication never breaks a command", () => {
    const throwing = vi.fn(() => {
      throw new Error("observer bug");
    });
    const healthy = vi.fn();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const unsubThrowing = subscribeToDomainEvents(throwing);
    const unsubHealthy = subscribeToDomainEvents(healthy);

    expect(() => publishDomainEvent(makeEvent())).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);

    unsubThrowing();
    unsubHealthy();
    errorSpy.mockRestore();
  });
});
