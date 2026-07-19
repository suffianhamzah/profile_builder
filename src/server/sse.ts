import type { ChatEvent } from "../lib/api-contracts";

export function encodeSseEvent(event: ChatEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
