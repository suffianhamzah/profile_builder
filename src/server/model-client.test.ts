import { describe, expect, it } from "vitest";
import { createModelClient, parseTurnAnalysis } from "./model-client";

describe("parseTurnAnalysis", () => {
  it("validates and returns a structured analysis", () => {
    expect(
      parseTurnAnalysis(
        JSON.stringify({
          operations: [
            { kind: "set", field: "travelPace", value: "relaxed" },
            { kind: "add", field: "interests", values: ["food"] },
          ],
          semanticConflicts: [],
          mentionedDestinations: ["Tokyo"],
          customConflictResolution: null,
        }),
      ),
    ).toEqual({
      operations: [
        { kind: "set", field: "travelPace", value: "relaxed" },
        { kind: "add", field: "interests", values: ["food"] },
      ],
      semanticConflicts: [],
      mentionedDestinations: ["Tokyo"],
    });
  });

  it("rejects malformed or out-of-domain operations", () => {
    expect(() => parseTurnAnalysis("not json")).toThrow("invalid JSON");
    expect(() =>
      parseTurnAnalysis(
        JSON.stringify({
          operations: [{ kind: "set", field: "age", value: "42" }],
          semanticConflicts: [],
          mentionedDestinations: [],
          customConflictResolution: null,
        }),
      ),
    ).toThrow("invalid structured result");
  });
});

describe("createModelClient", () => {
  it("fails clearly when configuration is incomplete", () => {
    expect(() => createModelClient({})).toThrow(
      "MODEL_API_KEY, MODEL_BASE_URL, MODEL_NAME",
    );
  });
});
