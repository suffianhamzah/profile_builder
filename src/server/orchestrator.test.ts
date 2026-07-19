import { describe, expect, it, vi } from "vitest";

import { createEmptyState, type AppState } from "../lib/contracts";
import type {
  ModelClient,
  RespondToTurnInput,
} from "./model-client";
import {
  applyConflictDecision,
  runConflictResolutionResponse,
} from "./orchestrator";
import type { StateStore } from "./state-store";

describe("conflict resolution response", () => {
  it("applies the human choice and streams a responder-only confirmation", async () => {
    let savedState: AppState = {
      ...createEmptyState(),
      profile: { ...createEmptyState().profile, travelPace: "relaxed" },
      pendingConflicts: [
        {
          id: "conflict-1",
          field: "travelPace",
          existingValue: "relaxed",
          proposedValue: "packed",
          reason: "The pace changed.",
          proposedOperations: [
            { kind: "set", field: "travelPace", value: "packed" },
          ],
          createdAt: "2026-07-19T12:00:00.000Z",
        },
      ],
    };
    const store: StateStore = {
      async load() {
        return savedState;
      },
      async save(state) {
        savedState = state;
      },
    };
    const analyzeTurn = vi.fn(async () => {
      throw new Error("The analyzer must not run for a button decision.");
    });
    let responderInput: RespondToTurnInput | undefined;
    const modelClient: ModelClient = {
      analyzeTurn,
      async *streamResponse(input) {
        responderInput = input;
        yield "Packed pace saved. ";
        yield "Which destinations interest you?";
      },
    };

    const turn = await applyConflictDecision("conflict-1", "accept", store);
    const events = [];
    for await (const event of runConflictResolutionResponse(turn, {
      modelClient,
      store,
    })) {
      events.push(event);
    }

    expect(analyzeTurn).not.toHaveBeenCalled();
    expect(turn.state.profile.travelPace).toBe("packed");
    expect(turn.state.pendingConflicts).toEqual([]);
    expect(responderInput?.resolvedConflict).toEqual({
      decision: "accept",
      field: "travelPace",
      existingValue: "relaxed",
      proposedValue: "packed",
    });
    expect(events.map((event) => event.type)).toEqual([
      "state.updated",
      "assistant.delta",
      "assistant.delta",
      "turn.completed",
    ]);
    expect(savedState.messages.at(-1)?.content).toBe(
      "Packed pace saved. Which destinations interest you?",
    );
  });
});
