import type { ChatEvent } from "./api-contracts";

type EventHandler = (event: ChatEvent) => void;

function parseEventBlock(block: string): ChatEvent | null {
  let eventName = "";
  const dataLines: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;

    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") eventName = value;
    if (field === "data") dataLines.push(value);
  }

  if (dataLines.length === 0) return null;

  const parsed = JSON.parse(dataLines.join("\n")) as Partial<ChatEvent>;
  if (!("type" in parsed) && eventName) {
    return { ...parsed, type: eventName } as ChatEvent;
  }
  return parsed as ChatEvent;
}

function nextEventBoundary(buffer: string): { index: number; length: number } | null {
  const match = /\r?\n\r?\n/.exec(buffer);
  return match ? { index: match.index, length: match[0].length } : null;
}

/** Reads the JSON payloads in a fetch-based Server-Sent Events response. */
export async function readChatEventStream(
  response: Response,
  onEvent: EventHandler,
): Promise<void> {
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the status-based message when the server did not return JSON.
    }
    throw new Error(message);
  }

  if (!response.body) throw new Error("The server returned an empty response stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    let boundary = nextEventBoundary(buffer);
    while (boundary) {
      const event = parseEventBlock(buffer.slice(0, boundary.index));
      buffer = buffer.slice(boundary.index + boundary.length);
      if (event) onEvent(event);
      boundary = nextEventBoundary(buffer);
    }

    if (done) break;
  }

  const finalEvent = parseEventBlock(buffer.trim());
  if (finalEvent) onEvent(finalEvent);
}
