import { LoggingEventBus } from "./loggingEventBus.js";
import type { IEventBus } from "./IEventBus.js";

export type { IEventBus, EventEnvelope } from "./IEventBus.js";
export { LoggingEventBus } from "./loggingEventBus.js";

let instance: IEventBus | null = null;

export function getEventBus(): IEventBus {
  if (!instance) {
    instance = new LoggingEventBus();
  }
  return instance;
}
