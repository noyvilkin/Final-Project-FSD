import { appLogger } from "../logger.js";
import type { EventEnvelope, IEventBus } from "./IEventBus.js";

// In-process event bus that just logs every published event.
// Useful for local dev and tests until a real MQ implementation lands.
// Subscribers don't exist — this is publish-only.
export class LoggingEventBus implements IEventBus {
  async publish<TPayload>(envelope: EventEnvelope<TPayload>): Promise<void> {
    appLogger.info("[event-bus] publish", {
      topic:         envelope.topic,
      correlationId: envelope.correlationId,
      occurredAt:    envelope.occurredAt.toISOString(),
      payload:       envelope.payload,
    });
  }
}
