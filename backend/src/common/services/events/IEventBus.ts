// Generic, transport-agnostic event bus used by workflow orchestration.
// Swap the implementation (Kafka, QStash, Redis Streams, etc.) without
// touching call sites. Today only LoggingEventBus exists.

export interface EventEnvelope<TPayload = unknown> {
  topic:         string;
  payload:       TPayload;
  correlationId: string;
  occurredAt:    Date;
}

export interface IEventBus {
  publish<TPayload>(envelope: EventEnvelope<TPayload>): Promise<void>;
}
