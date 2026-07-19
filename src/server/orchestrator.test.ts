import { describe, expect, it, vi } from "vitest";

import type { ChatEvent } from "../lib/api-contracts";
import { createEmptyState, type PersistedState } from "../lib/domain";
import type {
  ModelClient,
  RespondToTurnInput,
} from "./model-client";
import {
  applyConflictDecision,
  runChatTurn,
  runConflictResolutionResponse,
} from "./orchestrator";
import type { StateStore } from "./state-store";

describe("conflict resolution response", () => {
  it("applies the human choice and streams a responder-only confirmation", async () => {
    let savedState: PersistedState = {
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
    expect(turn.userMessage.content).toBe("packed");
    expect(turn.state.messages.at(-1)).toEqual(turn.userMessage);
    expect(responderInput?.resolvedConflict).toEqual({
      decision: "accept",
      field: "travelPace",
      existingValue: "relaxed",
      proposedValue: "packed",
    });
    expect(responderInput?.state.messages.at(-1)).toEqual(turn.userMessage);
    expect(events.map((event) => event.type)).toEqual([
      "user.message.created",
      "state.updated",
      "assistant.delta",
      "assistant.delta",
      "turn.completed",
    ]);
    expect(savedState.messages.at(-2)).toEqual(turn.userMessage);
    expect(savedState.messages.at(-1)?.content).toBe(
      "Packed pace saved. Which destinations interest you?",
    );
  });
});

describe("typed conflict clarification", () => {
  it("skips the responder and directs the user to a newly created clarification", async () => {
    let savedState: PersistedState = {
      ...createEmptyState(),
      profile: { ...createEmptyState().profile, travelPace: "packed" },
    };
    const store: StateStore = {
      async load() {
        return savedState;
      },
      async save(state) {
        savedState = state;
      },
    };
    const streamResponse = vi.fn(async function* () {
      yield "I'll update that now.";
    });
    const modelClient: ModelClient = {
      async analyzeTurn() {
        return {
          operations: [],
          semanticConflicts: [
            {
              field: "travelPace",
              existingValue: "packed",
              proposedValue: "relaxed",
              reason: "This changes the saved travel pace.",
              proposedOperations: [
                { kind: "set", field: "travelPace", value: "relaxed" },
              ],
            },
          ],
          mentionedDestinations: [],
        };
      },
      streamResponse,
    };

    const events: ChatEvent[] = [];
    for await (const event of runChatTurn(
      { message: "I'd like slow travel" },
      { modelClient, store },
    )) {
      events.push(event);
    }

    expect(streamResponse).not.toHaveBeenCalled();
    expect(savedState.profile.travelPace).toBe("packed");
    expect(savedState.pendingConflicts).toHaveLength(1);
    expect(events.find((event) => event.type === "assistant.delta")).toEqual({
      type: "assistant.delta",
      text: "I found a preference that conflicts with your saved profile. Please answer the clarification below before we continue.",
    });
  });

  it("keeps an unclear answer pending without asking the responder to invent an update", async () => {
    let savedState: PersistedState = stateWithPendingPaceConflict();
    const store: StateStore = {
      async load() {
        return savedState;
      },
      async save(state) {
        savedState = state;
      },
    };
    const streamResponse = vi.fn(async function* () {
      yield "This should not be used.";
    });
    const modelClient: ModelClient = {
      async analyzeTurn() {
        return {
          operations: [],
          semanticConflicts: [],
          mentionedDestinations: [],
          customConflictResolution: {
            conflictId: "conflict-1",
            understood: false,
            summary: "The answer was unclear.",
            operations: [],
          },
        };
      },
      streamResponse,
    };

    const events: ChatEvent[] = [];
    for await (const event of runChatTurn(
      { message: "something else", resolvingConflictId: "conflict-1" },
      { modelClient, store },
    )) {
      events.push(event);
    }

    expect(streamResponse).not.toHaveBeenCalled();
    expect(savedState.profile.travelPace).toBe("relaxed");
    expect(savedState.pendingConflicts).toHaveLength(1);
    expect(events.find((event) => event.type === "assistant.delta")).toEqual({
      type: "assistant.delta",
      text: "I couldn't tell which preference you want me to remember. Please choose the current value, the proposed value, or give me a more specific answer.",
    });
  });

  it("emits the updated profile when a custom answer resolves the conflict", async () => {
    let savedState: PersistedState = stateWithPendingPaceConflict();
    const store: StateStore = {
      async load() {
        return savedState;
      },
      async save(state) {
        savedState = state;
      },
    };
    let responderInput: RespondToTurnInput | undefined;
    const modelClient: ModelClient = {
      async analyzeTurn() {
        return {
          operations: [],
          semanticConflicts: [],
          mentionedDestinations: [],
          customConflictResolution: {
            conflictId: "conflict-1",
            understood: true,
            summary: "Use a balanced pace instead.",
            operations: [
              { kind: "set", field: "travelPace", value: "balanced" },
            ],
          },
        };
      },
      async *streamResponse(input) {
        responderInput = input;
        yield "Balanced pace saved.";
      },
    };

    const events: ChatEvent[] = [];
    for await (const event of runChatTurn(
      { message: "balanced", resolvingConflictId: "conflict-1" },
      { modelClient, store },
    )) {
      events.push(event);
    }

    const stateEvent = events.find((event) => event.type === "state.updated");
    expect(stateEvent).toMatchObject({
      type: "state.updated",
      profile: { travelPace: "balanced" },
      pendingConflicts: [],
    });
    expect(savedState.profile.travelPace).toBe("balanced");
    expect(responderInput?.resolvedConflict).toEqual({
      decision: "custom",
      field: "travelPace",
      existingValue: "relaxed",
      proposedValue: "packed",
    });
  });
});

function stateWithPendingPaceConflict(): PersistedState {
  return {
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
}
