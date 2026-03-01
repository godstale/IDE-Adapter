import { IHandler } from '../protocol/types.js';

export class HandlerRegistry {
  private readonly handlers = new Map<string, IHandler>();

  register(topic: string, handler: IHandler): void {
    this.handlers.set(topic, handler);
  }

  get(topic: string): IHandler | undefined {
    return this.handlers.get(topic);
  }

  topics(): string[] {
    return [...this.handlers.keys()];
  }
}
