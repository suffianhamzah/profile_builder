import type { ChatEvent } from "../lib/api-contracts";

export function encodeSseEvent(event: ChatEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

type SseResponseOptions = {
  fallbackErrorMessage: string;
  onError?: (error: unknown) => void;
};

export function createSseResponse(
  events: AsyncIterable<ChatEvent>,
  options: SseResponseOptions,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(encodeSseEvent(event)));
        }
      } catch (error) {
        options.onError?.(error);
        controller.enqueue(
          encoder.encode(
            encodeSseEvent({
              type: "error",
              message:
                error instanceof Error
                  ? error.message
                  : options.fallbackErrorMessage,
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
