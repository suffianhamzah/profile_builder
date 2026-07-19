import { describe, expect, it } from "vitest";
import { createEmptyState } from "../lib/contracts";
import {
  buildAnalyzerInstructions,
  createModelClient,
  parseTurnAnalysis,
} from "./model-client";

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

describe("buildAnalyzerInstructions", () => {
  it("requires field-level classification without special-casing one domain", () => {
    const prompt = buildAnalyzerInstructions({ state: createEmptyState() });

    expect(prompt).toContain("compare every proposed profile change");
    expect(prompt).toContain("A field present in semanticConflicts must not also appear in operations");
    expect(prompt).toContain("quiet boutique hotels");
    expect(prompt).toContain("budgetStyle");
    expect(prompt).toContain("preferred season");
    expect(prompt).toContain("dietary preference");
  });
});
