import { describe, expect, it } from "vitest";
import { encodeSseEvent } from "./sse";

describe("encodeSseEvent", () => {
  it("encodes a named event with one JSON data record", () => {
    expect(encodeSseEvent({ type: "assistant.delta", text: "hello\nworld" })).toBe(
      'event: assistant.delta\ndata: {"type":"assistant.delta","text":"hello\\nworld"}\n\n',
    );
  });
});
