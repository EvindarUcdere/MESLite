import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

export const domainEventBus = new EventEmitter();

domainEventBus.setMaxListeners(50);

export function emitDomainEvent(type, payload = {}) {
  const event = {
    id: randomUUID(),
    type,
    occurredAt: new Date().toISOString(),
    payload
  };

  domainEventBus.emit(type, event);
  domainEventBus.emit("*", event);
  return event;
}

export function onDomainEvent(type, handler) {
  domainEventBus.on(type, async (event) => {
    try {
      await handler(event);
    } catch (error) {
      console.error(`[domain-event] ${type} handler failed`, error);
    }
  });
}
