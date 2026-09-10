/**
 * The Domain Event Bus (ADR 0017): a typed, module-level, in-memory,
 * synchronous emitter. Published to exclusively by Domain Commands after a
 * write lands; observed by whoever cares about what the user did.
 *
 * Deliberately NOT a data channel: the Query cache remains the only read
 * source, and invalidation (not the bus) keeps caches fresh. Bypass writes
 * (backup restore, migration, imports, the calendar sync engine) publish
 * nothing — they are not user intents. No cross-tab and no cross-device
 * propagation: a tab hears only its own commands, matching the app-wide
 * baseline.
 */
import type { DomainEvent } from "./domain-event";

export type DomainEventHandler = (event: DomainEvent) => void;

const handlers = new Set<DomainEventHandler>();

/**
 * Subscribe to Domain Events as they land. Returns an unsubscribe function.
 */
export function subscribeToDomainEvents(
  handler: DomainEventHandler,
): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/**
 * Publish a Domain Event synchronously. Called only from Domain Commands,
 * after the write has landed. A throwing observer is isolated (logged, never
 * propagated) so observation can never roll back a write that already landed.
 */
export function publishDomainEvent(event: DomainEvent): void {
  for (const handler of handlers) {
    try {
      handler(event);
    } catch (err) {
      console.error("Domain event handler error:", err);
    }
  }
}
