import { describe, expect, it } from "vitest";
import type { ChatEvent } from "./api-contracts";
import { readChatEventStream } from "./sse-client";

function streamedResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

describe("readChatEventStream", () => {
  it("parses events split across network chunks", async () => {
    const events: ChatEvent[] = [];
    const response = streamedResponse([
      'event: assistant.delta\ndata: {"type":"assistant.',
      'delta","text":"Bon',
      'jour"}\n\nevent: turn.completed\ndata: {"type":"turn.completed","assistantMessage":',
      '{"id":"a1","role":"assistant","content":"Bonjour","createdAt":"2026-07-19T00:00:00.000Z"}}\n\n',
    ]);

    await readChatEventStream(response, (event) => events.push(event));

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "assistant.delta", text: "Bonjour" });
    expect(events[1]?.type).toBe("turn.completed");
  });

  it("uses a named SSE event when its JSON data omits type", async () => {
    const events: ChatEvent[] = [];
    const response = streamedResponse(['event: assistant.delta\r\ndata: {"text":"Hi"}\r\n\r\n']);

    await readChatEventStream(response, (event) => events.push(event));

    expect(events).toEqual([{ type: "assistant.delta", text: "Hi" }]);
  });

  it("surfaces an API error message before reading the stream", async () => {
    const response = new Response(JSON.stringify({ error: "Model is not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });

    await expect(readChatEventStream(response, () => undefined)).rejects.toThrow(
      "Model is not configured",
    );
  });
});
