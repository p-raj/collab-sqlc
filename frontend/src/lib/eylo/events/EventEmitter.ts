import { logger } from "../utils";

import type { EventTypes } from "./EventTypes";

type TEventListeners = { [K in EventTypes]: Function[] };
export class EventEmitter {
  private listeners: TEventListeners = {} as TEventListeners;

  on(event: EventTypes, listener: Function): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
    logger.debug(`EventEmitter: Registering listener for event: ${event} ${listener.name}`);
  }

  off(event: EventTypes, listener: Function): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((l) => l !== listener);
    logger.debug(`EventEmitter: Unregistering listener for event: ${event} ${listener.name}`);
  }

  emit = async (event: EventTypes, ...args: any[]): Promise<void> => {
    if (!this.listeners[event]) return;
    const handlers = this.listeners[event];
    for (const handler of handlers) {
      logger.debug(`EventEmitter: Emitting event: ${event} ${handler.name}`);
      try {
        const result = handler(...args);
        if (result instanceof Promise) {
          try {
            await result;
          } catch (error) {
            logger.error(`Error in async message handler for ${event}:`, event, error);
          }
        }
      } catch (error) {
        logger.error(`Error in message handler for ${event}:`, event, error);
      }
    }
  };
}
