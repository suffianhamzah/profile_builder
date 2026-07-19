import { describe, expect, it, vi } from "vitest";
import type { ChatEvent } from "../lib/api-contracts";
import { readChatEventStream } from "../lib/sse-client";
import { createSseResponse, encodeSseEvent } from "./sse";

describe("encodeSseEvent", () => {
  it("encodes a named event with one JSON data record", () => {
    expect(encodeSseEvent({ type: "assistant.delta", text: "hello\nworld" })).toBe(
      'event: assistant.delta\ndata: {"type":"assistant.delta","text":"hello\\nworld"}\n\n',
    );
  });
});

describe("createSseResponse", () => {
  it("streams events with the shared SSE headers and browser parser", async () => {
    async function* events(): AsyncGenerator<ChatEvent> {
      yield { type: "assistant.delta", text: "Hello" };
      yield { type: "assistant.delta", text: " there" };
    }

    const response = createSseResponse(events(), {
      fallbackErrorMessage: "Could not stream.",
    });
    const received: ChatEvent[] = [];
    await readChatEventStream(response, (event) => received.push(event));

    expect(response.headers.get("Content-Type")).toBe(
      "text/event-stream; charset=utf-8",
    );
    expect(received).toEqual([
      { type: "assistant.delta", text: "Hello" },
      { type: "assistant.delta", text: " there" },
    ]);
  });

  it("turns a stream failure into a typed error event", async () => {
    const failure = new Error("Model stream failed.");
    const onError = vi.fn();
    async function* events(): AsyncGenerator<ChatEvent> {
      throw failure;
    }

    const response = createSseResponse(events(), {
      fallbackErrorMessage: "Could not stream.",
      onError,
    });
    const received: ChatEvent[] = [];
    await readChatEventStream(response, (event) => received.push(event));

    expect(onError).toHaveBeenCalledWith(failure);
    expect(received).toEqual([
      { type: "error", message: "Model stream failed." },
    ]);
  });
});
