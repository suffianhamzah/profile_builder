import { describe, expect, it } from "vitest";
import { createEmptyState } from "../lib/domain";
import {
  buildAnalyzerInstructions,
  buildAnalyzerMessages,
  buildResponderInstructions,
} from "./model-prompts";

describe("buildAnalyzerInstructions", () => {
  it("requires field-level classification without special-casing one domain", () => {
    const prompt = buildAnalyzerInstructions({ state: createEmptyState() });

    expect(prompt).toContain("compare every proposed profile change");
    expect(prompt).toContain(
      "A field present in semanticConflicts must not also appear in operations",
    );
    expect(prompt).toContain("quiet boutique hotels");
    expect(prompt).toContain("budgetStyle");
    expect(prompt).toContain("preferred season");
    expect(prompt).toContain("dietary preference");
  });

  it("asks the model to analyze only the latest user message", () => {
    const state = createEmptyState();
    state.messages = [
      {
        id: "user-1",
        role: "user",
        content: "I like beaches.",
        createdAt: "2026-07-19T12:00:00.000Z",
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: "How about your travel pace?",
        createdAt: "2026-07-19T12:00:01.000Z",
      },
      {
        id: "user-2",
        role: "user",
        content: "I prefer a relaxed pace.",
        createdAt: "2026-07-19T12:00:02.000Z",
      },
    ];

    const messages = buildAnalyzerMessages({ state });

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      role: "user",
      content: expect.stringContaining("I prefer a relaxed pace."),
    });
    expect(messages[1]).not.toMatchObject({
      content: expect.stringContaining("I like beaches."),
    });
  });
});

describe("buildResponderInstructions", () => {
  it("asks for one high-value missing detail without overwhelming the user", () => {
    const prompt = buildResponderInstructions({
      state: createEmptyState(),
      destinationResults: [],
    });

    expect(prompt).toContain("Ask at most one short, easy-to-answer question");
    expect(prompt).toContain("destination or region");
    expect(prompt).toContain("highest-priority useful detail");
    expect(prompt).toContain("Never list several missing fields");
    expect(prompt).toContain("Do not repeat a question");
    expect(prompt).toContain("Never say that a value was noted, saved");
  });

  it("makes conflict resolution the only call to action when one is pending", () => {
    const state = createEmptyState();
    state.pendingConflicts = [
      {
        id: "conflict-1",
        field: "travelPace",
        existingValue: "relaxed",
        proposedValue: "packed",
        reason: "The preferences may not coexist.",
        proposedOperations: [
          { kind: "set", field: "travelPace", value: "packed" },
        ],
        createdAt: "2026-07-19T12:00:00.000Z",
      },
    ];

    const prompt = buildResponderInstructions({
      state,
      destinationResults: [],
    });

    expect(prompt).toContain("the only call to action is to resolve");
    expect(prompt).toContain('"id":"conflict-1"');
  });

  it("treats current conflict state as authoritative after a resolution", () => {
    const state = createEmptyState();
    state.messages = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "A travel pace conflict is pending.",
        createdAt: "2026-07-19T12:00:00.000Z",
      },
    ];

    const prompt = buildResponderInstructions({
      state,
      destinationResults: [],
      resolvedConflict: {
        decision: "reject",
        field: "travelPace",
        existingValue: "relaxed",
        proposedValue: "packed",
      },
    });

    expect(prompt).toContain("sole source of truth");
    expect(prompt).toContain("If Pending conflicts is empty, never say");
    expect(prompt).toContain('"decision":"reject"');
    expect(prompt).toContain('"existingValue":"relaxed"');
    expect(prompt).toContain('For a "custom" resolution');
  });
});
