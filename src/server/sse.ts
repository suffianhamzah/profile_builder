import type { ChatEvent } from "../lib/contracts";

export function encodeSseEvent(event: ChatEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
