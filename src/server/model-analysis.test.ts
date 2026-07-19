import { describe, expect, it } from "vitest";
import {
  parseTurnAnalysis,
  turnAnalysisResponseFormat,
} from "./model-analysis";

describe("turnAnalysisResponseFormat", () => {
  it("generates the strict JSON schema used by the model request", () => {
    expect(turnAnalysisResponseFormat.type).toBe("json_schema");
    expect(turnAnalysisResponseFormat.json_schema.name).toBe(
      "travel_profile_turn_analysis",
    );
    expect(turnAnalysisResponseFormat.json_schema.strict).toBe(true);
  });
});

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
